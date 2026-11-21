// Vercel serverless function: reads one contract family with Google Gemini and
// returns the ~14 terms as strict JSON. The API key never leaves the server.
//
// Env vars (set in Vercel → Settings → Environment Variables):
//   GEMINI_API_KEY  required — from Google AI Studio (aistudio.google.com)
//   GEMINI_MODEL    optional — a model name such as the one shown in Google AI Studio.
//                   If unset, the function asks Google which models this key can use
//                   and picks the newest stable Flash model (see pickModel).
//
// GET /api/extract reports whether a key is configured and which model is used
// (never the key itself), so the setup can be checked from a browser.

const API = 'https://generativelanguage.googleapis.com/v1beta';
/** Total time for one extraction (Vercel allows 30 s; the browser waits 28 s). */
const TIMEOUT_MS = 25_000;
/** The first model gets this long before we fall back to a faster one. */
const FIRST_ATTEMPT_MS = 10_000;
const MAX_CHARS = 60_000;

export const TERM_KEYS = [
  'parties', 'effective', 'end', 'renewal', 'notice', 'tfc', 'priceIncrease',
  'minCommit', 'liability', 'assignment', 'law', 'audit', 'payment', 'noticeAddress',
] as const;

export const TERM_HELP: Record<(typeof TERM_KEYS)[number], string> = {
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

export const SYSTEM =
  'You extract terms from a supplier contract family (a signed agreement plus any amendments). ' +
  'Later-signed amendments override the original agreement. For every term, copy the supporting sentence ' +
  'exactly as written - character for character, without the clause number - into "quote", and give the id of the document it came from. ' +
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

interface ModelInfo {
  name: string; // "models/gemini-..."
  supportedGenerationMethods?: string[];
}

/**
 * Choose a model from the ones this key can call: Flash models that support
 * generateContent, newest version first, stable before preview, full Flash before
 * Flash-Lite. Specialised variants (image, audio, TTS, live, embedding) are skipped.
 */
export function rankModels(models: ModelInfo[]): string[] {
  return models
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /^gemini-[\d.]+-flash/.test(n) && !/image|audio|tts|live|embed|thinking|exp/.test(n))
    .map((n) => ({
      n,
      version: Number(/^gemini-([\d.]+)/.exec(n)![1].split('.').slice(0, 2).join('.')),
      preview: /preview/.test(n),
      lite: /lite/.test(n),
      dated: /-\d{2,}(-|$)/.test(n.replace(/^gemini-[\d.]+/, '')),
    }))
    .sort((a, b) => b.version - a.version || +a.preview - +b.preview || +a.lite - +b.lite || +a.dated - +b.dated || a.n.length - b.n.length)
    .map((x) => x.n);
}

export const pickModel = (models: ModelInfo[]): string | null => rankModels(models)[0] ?? null;

/**
 * Models to try, in order: the two newest stable Flash-Lite models first (they
 * answered in about 3 s with every quote verbatim, while full Flash models took
 * over 12 s or were overloaded), then the best full Flash models.
 */
export function fallbackChain(models: ModelInfo[], preferred?: string): string[] {
  const ranked = rankModels(models);
  const full = ranked.filter((n) => !/lite/.test(n) && !/preview/.test(n));
  const lite = ranked.filter((n) => /lite/.test(n) && !/preview/.test(n));
  const chain = [preferred, lite[0], lite[1], full[0], full[1], ranked[0]].filter((n): n is string => !!n);
  return [...new Set(chain)].slice(0, 4);
}

let cachedModels: ModelInfo[] | null = null;

async function listModels(key: string, signal?: AbortSignal): Promise<ModelInfo[]> {
  if (cachedModels) return cachedModels;
  const res = await fetch(`${API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key }, signal });
  if (!res.ok) throw new Error(`list_models_${res.status}`);
  cachedModels = ((await res.json()) as { models?: ModelInfo[] }).models ?? [];
  return cachedModels;
}

/** Setup check: is a key configured, and which model would be used? Never returns the key. */
export async function GET(): Promise<Response> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(200, { configured: false, model: null });
  try {
    const models = await listModels(key);
    const flash = models.map((m) => m.name.replace(/^models\//, '')).filter((n) => n.includes('flash'));
    return json(200, {
      configured: true,
      model: fallbackChain(models, process.env.GEMINI_MODEL)[0] ?? null,
      fromEnv: !!process.env.GEMINI_MODEL,
      fallbackOrder: fallbackChain(models, process.env.GEMINI_MODEL),
      flashModels: flash,
    });
  } catch (e) {
    return json(200, { configured: true, model: process.env.GEMINI_MODEL ?? null, error: e instanceof Error ? e.message : 'failed' });
  }
}

export async function POST(request: Request): Promise<Response> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(503, { error: 'not_configured' });

  let docs: InDoc[];
  let requested: string | undefined;
  try {
    const body = (await request.json()) as { docs?: InDoc[]; model?: string };
    requested = typeof body.model === 'string' ? body.model : undefined;
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

  const deadline = Date.now() + TIMEOUT_MS;
  let chain: string[];
  try {
    const models = await listModels(key, AbortSignal.timeout(5_000));
    const names = new Set(models.map((m) => m.name.replace(/^models\//, '')));
    // A caller may ask for a specific model, but only one this key can use.
    const preferred = requested && names.has(requested) ? requested : process.env.GEMINI_MODEL;
    chain = fallbackChain(models, preferred);
    if (!chain.length) return json(502, { error: 'no_flash_model' });
  } catch (e) {
    return json(502, { error: e instanceof Error ? e.message : 'list_models_failed' });
  }

  // Try each model in turn; move on when one is busy, slow or unavailable.
  const attempts: { model: string; result: string }[] = [];
  for (const [i, model] of chain.entries()) {
    const left = deadline - Date.now();
    if (left < 3_000) break;
    const budget = i === 0 && chain.length > 1 ? Math.min(left, FIRST_ATTEMPT_MS) : left;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), budget);
    try {
      const res = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const detail = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message;
        attempts.push({ model, result: `${res.status}${detail ? `: ${detail.slice(0, 120)}` : ''}` });
        if (res.status === 404) cachedModels = null;
        if (res.status === 400 || res.status === 401 || res.status === 403) break; // the request or key is wrong; another model won't help
        continue;
      }
      const data = (await res.json()) as GeminiResponse;
      if (data.promptFeedback?.blockReason) {
        attempts.push({ model, result: `blocked: ${data.promptFeedback.blockReason}` });
        continue;
      }
      const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
      const parsed = JSON.parse(text) as { terms?: unknown[] };
      if (!Array.isArray(parsed.terms)) {
        attempts.push({ model, result: 'bad output' });
        continue;
      }
      return json(200, { model: data.modelVersion ?? model, terms: parsed.terms, attempts });
    } catch {
      attempts.push({ model, result: ctrl.signal.aborted ? `timed out after ${Math.round(budget / 1000)} s` : 'bad output' });
    } finally {
      clearTimeout(timer);
    }
  }
  const last = attempts[attempts.length - 1];
  return json(502, { error: 'upstream', status: last ? Number(last.result.slice(0, 3)) || undefined : undefined, detail: attempts.map((a) => `${a.model}: ${a.result}`).join(' · ').slice(0, 300), attempts });
}
