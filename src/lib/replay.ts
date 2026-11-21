// Simulated replay of the AI extraction step. The demo uses pre-computed AI
// results (the terms stored in the seed data); no model or server is called.
// The verbatim-quote check and the date maths below are real code.
import type { Contract, TermKey } from '../data/types';
import { GO_LIVE } from '../data/seed';
import { computeDates, TERM_LABEL, type DateResult } from './logic';

export const REPLAY_STEPS = ['Reading documents', 'Extracting 14 terms', 'Checking quotes verbatim', 'Recalculating dates'] as const;
/** Time per animation step; four steps make about 1.8 s. */
export const REPLAY_STEP_MS = 450;

export type DiffStatus = 'matched' | 'changed' | 'new' | 'missing';

export interface DiffRow {
  key: TermKey;
  label: string;
  status: DiffStatus;
  stored: string;
  extracted: string;
  quote: string;
  quoteVerified: boolean;
  confidence: number | null;
}

export interface ReplayResult {
  rows: DiffRow[];
  verified: number;
  total: number;
  datesUnchanged: boolean;
  at: Date;
}

/** An extracted term, in the shape an extraction run produces. */
export interface ExtractedTerm {
  key: TermKey;
  value: string;
  quote: string;
  docId: string;
  confidence: number;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** The same verbatim check the repository applies to stored quotes. */
export function quoteInDocs(c: Contract, quote: string, docId?: string): boolean {
  if (!quote) return false;
  const docs = docId ? c.docs.filter((d) => d.id === docId) : c.docs;
  return (docs.length ? docs : c.docs).some((d) => d.text.includes(quote));
}

/** Term-by-term comparison of an extraction run against the stored terms. */
export function diffTerms(c: Contract, extracted: ExtractedTerm[]): DiffRow[] {
  return c.terms.map((t) => {
    const e = extracted.find((x) => x.key === t.key);
    const storedQuote = t.quote ?? '';
    let status: DiffStatus;
    if (!e) status = 'missing';
    else if (!storedQuote && e.quote) status = 'new';
    else if (norm(storedQuote) === norm(e.quote)) status = 'matched';
    else status = 'changed';
    return {
      key: t.key,
      label: TERM_LABEL[t.key],
      status,
      stored: t.value,
      extracted: e?.value ?? '—',
      quote: e?.quote ?? '',
      quoteVerified: !!e && quoteInDocs(c, e.quote, e.docId),
      confidence: e ? e.confidence : null,
    };
  });
}

/** The pre-computed AI extraction for a contract (what the replay "extracts"). */
export const precomputedExtraction = (c: Contract): ExtractedTerm[] =>
  c.terms.map((t) => ({ key: t.key, value: t.value, quote: t.quote ?? '', docId: t.docId, confidence: t.confidence }));

/** Replays extraction from pre-computed results, then runs the real quote check and date maths. */
export function replayExtraction(c: Contract, stored: DateResult): ReplayResult {
  const rows = diffTerms(c, precomputedExtraction(c));
  const again = computeDates(c, GO_LIVE);
  return {
    rows,
    verified: rows.filter((r) => r.quoteVerified).length,
    total: rows.length,
    datesUnchanged: again.decideBy === stored.decideBy && again.noticeDeadline === stored.noticeDeadline && again.windowOpen === stored.windowOpen,
    at: new Date(),
  };
}

export const replaySummary = (r: ReplayResult) =>
  `Simulated replay · ${r.verified} of ${r.total} quotes found verbatim · dates ${r.datesUnchanged ? 'unchanged' : 'changed'}`;
