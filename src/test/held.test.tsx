import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { click, renderAt, setDay } from './render';
import { CONTRACTS, GO_LIVE } from '../data/seed';
import { assignOwner, computeDates, scheduleOf } from '../lib/logic';
import { northStar, onTimeAndSent } from '../views/Triage';

const tile = (label: string) =>
  Number([...document.querySelectorAll('.pipe')].find((p) => p.querySelector('.pipe-l')!.textContent === label)!.querySelector('.pipe-n')!.textContent);

describe('held letters are not forgotten (fix 8)', () => {
  it('Northwind: held, then ready to send, then escalated if still unsent', () => {
    renderAt('#/brief/northwind');
    click(/Record decision/);
    click(/Approve as/);
    expect(screen.getAllByText('Letter held').length).toBeGreaterThan(0);
    setDay(23); // 16 Dec 2026, window opens
    expect(screen.getAllByText('Ready to send').length).toBeGreaterThan(0);
    expect(screen.getByRole('status').textContent).toContain('Ready to send');
    setDay(46); // 8 Jan 2027 = 5 business days before 15 Jan close
    expect(screen.getByRole('alert').textContent).toContain('Escalated: the letter is still unsent');
  });

  it('north star counts a decision only once its notice is sent in the window', () => {
    const c = CONTRACTS.find((x) => x.id === 'quill')!;
    const dr = computeDates(c);
    const base = { c, dr, sch: scheduleOf(c, dr), owner: assignOwner(c) };
    const rec = { decision: 'exit' as const, recommended: 'exit' as const, decidedOn: GO_LIVE, decidedBy: 'Alex Moreno' };
    const unsent = { ...base, stage: 'ready' as const, rec: { ...rec, letter: { status: 'approved' as const } } };
    const sent = { ...base, stage: 'decided' as const, rec: { ...rec, letter: { status: 'sent' as const, sentOn: GO_LIVE } } };
    expect(onTimeAndSent(unsent)).toBe(false);
    expect(onTimeAndSent(sent)).toBe(true);
    expect(northStar([unsent]).done).toBe(0);
    expect(northStar([sent]).done).toBe(6000);
  });

  it('shows ready-to-send letters in the queue', async () => {
    renderAt('#/brief/northwind');
    click(/Record decision/);
    click(/Approve as/);
    setDay(23);
    location.hash = '#/triage';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await screen.findByText('Renewal queue');
    expect(tile('Ready to send')).toBe(1);
    click('Letters');
    const rows = [...document.querySelectorAll('.tbl tbody tr')];
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Ready to send');
  });
});
