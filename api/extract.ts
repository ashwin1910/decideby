// Vercel serverless function: reads one contract family with Google Gemini and
// returns the ~14 terms as strict JSON. The API key never leaves the server.
//
// Env vars (set in Vercel → Settings → Environment Variables):
//   GEMINI_API_KEY  required — from Google AI Studio (aistudio.google.com)
//   GEMINI_MODEL    optional — defaults to DEFAULT_MODEL below

const DEFAULT_MODEL = 'gemini-2.5-flash';
const TIMEOUT_MS = 18_000;
const MAX_CHARS = 60_000;

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

// Gemini structured output: an OpenAPI-style schema the response must follow.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  required: ['terms'],
  properties: {
    terms: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['key', 'value', 'quote', 'docId', 'confidence'],
        properties: {
          key: { type: 'STRING', enum: [...TERM_KEYS] },
          value: { type: 'STRING', description: 'Short plain-English value of the term' },
          quote: { type: 'STRING', description: 'Exact verbatim sentence from the document, or "" if not found' },
          docId: { type: 'STRING', description: 'id of the document the quote comes from, or ""' },
          confidence: { type: 'NUMBER', description: '0 to 1' },
        },
      },
    },
  },
};

const SYSTEM =
  'You extract terms from a supplier contract family (a signed agreement plus any amendments). ' +
  'Later-signed amendments override the original agreement. For every term, copy the supporting sentence ' +
  'exactly as written - character for character - into "quote", and give the id of the document it came from. ' +
  'If a term is not in any document, set quote and docId to "" and confidence low. Never invent text.';

interface InDoc {
  id: string;
  kind: string;
  title: string;
  signedOn?: string;
  text: string;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function POST(request: Request): Promise<Response> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(503, { error: 'not_configured' });
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  let docs: InDoc[];
  try {
    const body = (await request.json()) as { docs?: InDoc[] };
    docs = (body.docs ?? []).filter((d) => d && typeof d.text === 'string' && typeof d.id === 'string' && d.kind !== 'duplicate');
  } catch {
    return json(400, { error: 'bad_json' });
  }
  const total = docs.reduce((a, d) => a + d.text.length, 0);
  if (!docs.length || docs.length > 10 || total > MAX_CHARS) return json(400, { error: 'bad_input' });

  const documents = docs
    .map((d) => `<document id="${d.id}" kind="${d.kind}" title="${d.title}"${d.signedOn ? ` signed="${d.signedOn}"` : ''}>\n${d.text}\n</document>`)
    .join('\n\n');
  const prompt =
    `${documents}\n\nExtract exactly these ${TERM_KEYS.length} terms, one entry each:\n` + TERM_KEYS.map((k) => `- ${k}: ${TERM_HELP[k]}`).join('\n');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return json(502, { error: 'upstream', status: res.status });
    const data = (await res.json()) as GeminiResponse;
    if (data.promptFeedback?.blockReason) return json(502, { error: 'blocked' });
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    const parsed = JSON.parse(text) as { terms?: unknown[] };
    if (!Array.isArray(parsed.terms)) return json(502, { error: 'bad_output' });
    return json(200, { model: data.modelVersion ?? model, terms: parsed.terms });
  } catch {
    return json(ctrl.signal.aborted ? 504 : 500, { error: ctrl.signal.aborted ? 'timeout' : 'failed' });
  } finally {
    clearTimeout(timer);
  }
}
