import { describe, expect, it } from 'vitest';
import { CONTRACTS, GO_LIVE } from '../data/seed';
import { assignOwner, computeDates } from '../lib/logic';
import { parseQuery, runQuery } from '../lib/search';

const rows = CONTRACTS.map((c) => ({ c, dr: computeDates(c), owner: assignOwner(c).owner }));
const ask = (q: string) => {
  const p = parseQuery(q, GO_LIVE);
  return { ...p, ids: runQuery(p, rows).map((r) => r.c.id).sort() };
};

describe('search: the four example chips are unchanged', () => {
  it('auto-renewing staffing over $50k, notice in next 90 days', () => {
    const r = ask('auto-renewing staffing contracts over $50k with notice deadlines in the next 90 days');
    expect(r.unparsed).toEqual([]);
    expect(r.ids).toEqual(['brightstaff', 'crestline-staffing']);
  });
  it("exit for convenience on 30 days' notice", () => {
    const r = ask("which suppliers can we exit for convenience on 30 days' notice?");
    expect(r.unparsed).toEqual([]);
    expect(r.ids).toHaveLength(15);
    expect(r.ids).toContain('quill');
  });
  it('software with a price increase over $100k', () => {
    const r = ask('software contracts with a price increase over $100k');
    expect(r.unparsed).toEqual([]);
    expect(r.ids).toEqual(['granite-data-warehouse', 'tidewater-hr-cloud', 'trailhead-crm']);
  });
  it('New York law with audit rights', () => {
    const r = ask('contracts governed by the law of New York with audit rights');
    expect(r.unparsed).toEqual([]);
    expect(r.ids).toEqual(['corelight-electrical', 'evergreen-plant-care', 'halcyon-strategy-partners', 'keystone', 'orbit', 'prism-print-promo']);
  });
});

describe('search: previously wrong answers', () => {
  it('handles negation: logistics contracts we cannot terminate for convenience', () => {
    const r = ask('logistics contracts we cannot terminate for convenience');
    expect(r.unparsed).toEqual([]);
    expect(r.ids).toEqual(['bluegate-customs-brokerage', 'northwind']);
  });
  it('handles "uncapped": no contract has uncapped liability', () => {
    const r = ask('which contracts have uncapped liability?');
    expect(r.filters.map((f) => f.label)).toEqual(['Liability uncapped']);
    expect(r.ids).toEqual([]);
  });
  it('recognises supplier names and answers owner + due date', () => {
    const r = ask('who owns the Atlas Freight contract and when is it due?');
    expect(r.unparsed).toEqual([]);
    expect(r.ids).toEqual(['atlas']);
    expect(r.show).toEqual({ owner: true, due: true });
  });
  it('recognises owner names', () => {
    const r = ask("Dana's contracts over $100k");
    expect(r.unparsed).toEqual([]);
    expect(r.ids).toEqual(['atlas', 'brightstaff', 'northgate-security-guards'].filter((id) => rows.find((x) => x.c.id === id)!.owner.name === 'Dana Okafor'));
  });
  it('reports what it could not interpret instead of pretending', () => {
    const r = ask('staffing contracts with a bad safety record');
    expect(r.unparsed).toEqual(['bad safety record']);
    const nothing = ask('quarterly SLA penalties');
    expect(nothing.filters).toEqual([]);
    expect(nothing.ids).toEqual([]);
  });
});
