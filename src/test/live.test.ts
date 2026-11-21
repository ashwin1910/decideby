import { describe, expect, it } from 'vitest';
import { CONTRACTS } from '../data/seed';
import { diffTerms, runLiveExtraction, type LiveTerm } from '../lib/live';

const bright = CONTRACTS.find((c) => c.id === 'brightstaff')!;
const asLive = (): LiveTerm[] => bright.terms.map((t) => ({ key: t.key, value: t.value, quote: t.quote ?? '', docId: t.docId, confidence: 0.9 }));

describe('live extraction', () => {
  it('diffs matched / changed / new / missing and applies the quote check', () => {
    const live = asLive();
    live.find((t) => t.key === 'liability')!.quote = 'A sentence that is not in the contract.';
    const rows = diffTerms(bright, live.filter((t) => t.key !== 'law'));
    const by = (k: string) => rows.find((r) => r.key === k)!;
    expect(by('notice').status).toBe('matched');
    expect(by('notice').quoteVerified).toBe(true);
    expect(by('liability').status).toBe('changed');
    expect(by('liability').quoteVerified).toBe(false);
    expect(by('law').status).toBe('missing');
  });

  it('falls back when the function is missing, errors or returns HTML', async () => {
    const html = async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } });
    const err = async () => new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } });
    const boom = async () => {
      throw new TypeError('network');
    };
    for (const f of [html, err, boom]) expect((await runLiveExtraction(bright, f as typeof fetch)).ok).toBe(false);
  });

  it('accepts a good response', async () => {
    const ok = async () => new Response(JSON.stringify({ model: 'gemini-2.5-flash', terms: asLive() }), { headers: { 'content-type': 'application/json' } });
    const r = await runLiveExtraction(bright, ok as typeof fetch);
    expect(r.ok && r.rows.every((x) => x.status === 'matched')).toBe(true);
  });
});
