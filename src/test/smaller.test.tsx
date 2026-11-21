import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { CONTRACTS } from '../data/seed';
import { last12Spend, recommend } from '../lib/logic';
import { click, renderAt, setDay } from './render';

const northwind = CONTRACTS.find((c) => c.id === 'northwind')!;

describe('fix 10: smaller fixes', () => {
  it('Northwind rate check says "Not checkable", not "Clean"', () => {
    renderAt('#/brief/northwind');
    expect(screen.getByText('Not checkable', { selector: '.badge' })).toBeTruthy();
    expect(screen.queryByText('Clean', { selector: '.badge' })).toBeNull();
    expect(document.body.textContent).toContain('Not checkable: invoices are billed as totals');
  });

  it('Northwind spend reflects lanes moving to Atlas; still answer-keyed exit with a note on the remaining lane', () => {
    expect(last12Spend(northwind)).toBeLessThan(40_000);
    const r = recommend(northwind);
    expect(r.action).toBe('exit');
    expect(r.reasons.join(' ')).toContain('from May 2026');
    expect(r.reasons.join(' ')).toContain('Remaining use moves to Atlas Freight Lines');
    expect(northwind.answerKey).toBeTruthy();
  });

  it('a partly used supplier with nowhere for the rest to go gets Reduce', () => {
    const c = { ...northwind, approverAnswers: { ...northwind.approverAnswers!, remainingGoesTo: undefined } };
    expect(recommend(c).action).toBe('reduce');
  });

  it('after procurement takes over, the decision is recorded as procurement', () => {
    renderAt('#/brief/brightstaff');
    setDay(8); // 1 Dec 2026: triage takeover
    expect(document.body.textContent).toContain('as Casey Ng (Procurement, took over from Dana Okafor)');
    click(/Record decision/);
    expect(document.body.textContent).toContain('decided by Casey Ng (Procurement');
  });

  it('reassigns the budget owner in one tap, and Reset undoes it', () => {
    renderAt('#/contract/brightstaff');
    fireEvent.change(screen.getByLabelText(/Reassign budget owner/), { target: { value: 'p-coo' } });
    expect(document.body.textContent).toContain('Reassigned to Lee Whitman');
    expect(JSON.parse(localStorage.getItem('decideby.owners.v1')!).brightstaff.personId).toBe('p-coo');
    click('Reset demo');
    expect(localStorage.getItem('decideby.owners.v1')).toBeNull();
  });

  it('Legal queue applies the documented rule, shows before/after counts and sorts by decide-by', () => {
    renderAt('#/repository');
    const aside = [...document.querySelectorAll('.card-h')].find((h) => h.textContent!.includes('Legal review queue'))!;
    const m = /(\d+) flagged → (\d+) after the rule/.exec(aside.textContent!)!;
    expect(Number(m[1])).toBeGreaterThan(Number(m[2]));
    const card = aside.closest('.card')!;
    const dates = [...card.querySelectorAll('tbody tr')].map((tr) => /decide by (\d+ \w+ \d{4})/.exec(tr.textContent!)![1]);
    const asTime = dates.map((d) => Date.parse(d));
    expect([...asTime].sort((a, b) => a - b)).toEqual(asTime);
    expect(card.querySelector('table')!.textContent).not.toContain('Governing law'); // Pulse's not-found law is outside the rule
    expect(card.querySelector('details.outside')!.textContent).toContain('Pulse Social Agency');
  });

  it('decision options and Brief links are real buttons with accessible names', () => {
    renderAt('#/brief/brightstaff');
    const exit = screen.getByRole('button', { name: 'Exit: Do not renew' });
    expect(exit.tagName).toBe('BUTTON');
    expect(screen.getByRole('button', { name: 'Renegotiate: Notice, then new terms (recommended)' }).getAttribute('aria-pressed')).toBe('true');
    renderAt('#/triage');
    expect(screen.getAllByRole('button', { name: /^Open brief for / }).length).toBeGreaterThan(0);
  });
});
