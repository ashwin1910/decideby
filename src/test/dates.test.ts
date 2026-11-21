import { describe, expect, it } from 'vitest';
import { CONTRACTS } from '../data/seed';
import { computeDates } from '../lib/logic';

const families = CONTRACTS.filter((c) => c.answerKey);

describe('date engine vs answer key', () => {
  it('has all nine answer-keyed families', () => {
    expect(families.map((c) => c.id).sort()).toEqual(
      ['atlas', 'brightstaff', 'keystone', 'lumen', 'meridian', 'northwind', 'orbit', 'paperleaf', 'quill'],
    );
  });
  it.each(families.map((c) => [c.id, c] as const))('%s matches its answer key', (_id, c) => {
    const r = computeDates(c);
    const k = c.answerKey!;
    expect(r.decideBy).toBe(k.decideBy);
    if (k.noticeDeadline) expect(r.noticeDeadline).toBe(k.noticeDeadline);
    if (k.windowOpen) expect(r.windowOpen).toBe(k.windowOpen);
  });
});

describe('business days skip company holidays', () => {
  it('BrightStaff decide-by skips 25 Dec and 1 Jan', () => {
    const r = computeDates(CONTRACTS.find((c) => c.id === 'brightstaff')!);
    expect(r.decideBy).toBe('2026-12-17');
    expect(r.steps.join(' ')).toContain('skips 25 Dec, 1 Jan');
  });
  it('no decide-by date falls on a weekend or holiday', async () => {
    const { isBusinessDay } = await import('../lib/dates');
    CONTRACTS.forEach((c) => expect(isBusinessDay(computeDates(c).decideBy), c.id).toBe(true));
  });
});
