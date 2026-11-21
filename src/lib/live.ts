// Calls /api/extract and compares the model's reading with the stored terms.
// Any failure (no key, error, >20 s) resolves to a fallback, never a throw.
import type { Contract, TermKey } from '../data/types';
import { TERM_LABEL } from './logic';

export const LIVE_TIMEOUT_MS = 20_000;

export interface LiveTerm {
  key: TermKey;
  value: string;
  quote: string;
  docId: string;
  confidence: number;
}

export type DiffStatus = 'matched' | 'changed' | 'new' | 'missing';

export interface DiffRow {
  key: TermKey;
  label: string;
  status: DiffStatus;
  stored: string;
  live: string;
  liveQuote: string;
  quoteVerified: boolean;
  confidence: number | null;
}

export type LiveResult =
  | { ok: true; model: string; rows: DiffRow[]; at: Date }
  | { ok: false; reason: string };

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** The same verbatim check the repository applies to stored quotes. */
export function quoteInDocs(c: Contract, quote: string, docId?: string): boolean {
  if (!quote) return false;
  const docs = docId ? c.docs.filter((d) => d.id === docId) : c.docs;
  return (docs.length ? docs : c.docs).some((d) => d.text.includes(quote));
}

export function diffTerms(c: Contract, live: LiveTerm[]): DiffRow[] {
  return c.terms.map((t) => {
    const l = live.find((x) => x.key === t.key);
    const storedQuote = t.quote ?? '';
    let status: DiffStatus;
    if (!l) status = 'missing';
    else if (!storedQuote && l.quote) status = 'new';
    else if (norm(storedQuote) === norm(l.quote)) status = 'matched';
    else status = 'changed';
    return {
      key: t.key,
      label: TERM_LABEL[t.key],
      status,
      stored: t.value,
      live: l?.value ?? '—',
      liveQuote: l?.quote ?? '',
      quoteVerified: !!l && quoteInDocs(c, l.quote, l.docId),
      confidence: l ? l.confidence : null,
    };
  });
}

export async function runLiveExtraction(c: Contract, fetchImpl: typeof fetch = fetch): Promise<LiveResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LIVE_TIMEOUT_MS);
  try {
    const res = await fetchImpl('/api/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ docs: c.docs.map(({ id, kind, title, signedOn, text }) => ({ id, kind, title, signedOn, text })) }),
      signal: ctrl.signal,
    });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) return { ok: false, reason: `HTTP ${res.status}` };
    const body = (await res.json()) as { model?: string; terms?: LiveTerm[] };
    if (!Array.isArray(body.terms)) return { ok: false, reason: 'bad response' };
    return { ok: true, model: body.model ?? 'claude', rows: diffTerms(c, body.terms), at: new Date() };
  } catch (e) {
    return { ok: false, reason: ctrl.signal.aborted ? 'timed out after 20 s' : 'network error' };
  } finally {
    clearTimeout(timer);
  }
}
