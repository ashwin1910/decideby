// Vercel serverless function: reads one contract family with Claude and returns
// the ~14 terms as strict JSON. The API key never leaves the server.
import Anthropic from '@anthropic-ai/sdk';

const TERM_KEYS = [
  'parties', 'effective', 'end', 'renewal', 'notice', 'tfc', 'priceIncrease',
  'minCommit', 'liability', 'assignment', 'law', 'audit', 'payment', 'noticeAddress',
] as const;

const TERM_HELP: Record<(typeof TERM_KEYS)[number], string> = {
  parties: 'the contracting parties',
  effective: 'effective date',
  end: 'end date or length of the current term (after amendments)',
  renewal: 'renewal mechanism and renewal term',
  notice: 'notice period or notice window for non-renewal / termination (after amendments)',
  tfc: 'termination for convenience: whether allowed and on how many days notice',
  priceIncrease: 'price increase rules (after amendments)',
  minCommit: 'minimum purchase commitment',
  liability: 'liability cap',
  assignment: 'assignment and change of control',
  law: 'governing law',
  audit: 'audit rights',
  payment: 'payment terms',
  noticeAddress: 'where and by what method notices must be delivered',
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['terms'],
  properties: {
    terms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'value', 'quote', 'docId', 'confidence'],
        properties: {
          key: { type: 'string', enum: [...TERM_KEYS] },
          value: { type: 'string', description: 'Short plain-English value of the term' },
          quote: { type: 'string', description: 'Exact verbatim sentence from the document, or "" if not found' },
          docId: { type: 'string', description: 'id of the document the quote comes from, or ""' },
          confidence: { type: 'number', description: '0 to 1' },
        },
      },
    },
  },
} as const;

interface InDoc {
  id: string;
  kind: string;
  title: string;
  signedOn?: string;
  text: string;
}

const MAX_CHARS = 60_000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function POST(request: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: 'not_configured' });

  let docs: InDoc[];
  try {
    const body = (await request.json()) as { docs?: InDoc[] };
    docs = (body.docs ?? []).filter((d) => d && typeof d.text === 'string' && typeof d.id === 'string' && d.kind !== 'duplicate');
  } catch {
    return json(400, { error: 'bad_json' });
  }
  const total = docs.reduce((a, d) => a + d.text.length, 0);
  if (!docs.length || docs.length > 10 || total > MAX_CHARS) return json(400, { error: 'bad_input' });

  const client = new Anthropic({ timeout: 18_000, maxRetries: 0 });
  const documents = docs
    .map((d) => `<document id="${d.id}" kind="${d.kind}" title="${d.title}"${d.signedOn ? ` signed="${d.signedOn}"` : ''}>\n${d.text}\n</document>`)
    .join('\n\n');

  try {
    const response = await client.beta.messages.create({
      model: 'claude-sonnet-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system:
        'You extract terms from a supplier contract family (a signed agreement plus any amendments). ' +
        'Later-signed amendments override the original agreement. For every term, copy the supporting sentence ' +
        'exactly as written - character for character - into "quote", and give the id of the document it came from. ' +
        'If a term is not in any document, set quote and docId to "" and confidence low. Never invent text.',
      messages: [
        {
          role: 'user',
          content:
            `${documents}\n\nExtract exactly these ${TERM_KEYS.length} terms, one entry each:\n` +
            TERM_KEYS.map((k) => `- ${k}: ${TERM_HELP[k]}`).join('\n'),
        },
      ],
    });
    if (response.stop_reason === 'refusal') return json(502, { error: 'refused' });
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    const parsed = JSON.parse(text) as { terms: unknown[] };
    return json(200, { model: response.model, terms: parsed.terms });
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError) return json(504, { error: 'timeout' });
    if (err instanceof Anthropic.APIError) return json(502, { error: 'upstream', status: err.status });
    return json(500, { error: 'failed' });
  }
}
