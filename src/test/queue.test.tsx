import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderAt } from './render';

const queueRows = () => [...document.querySelectorAll('.tbl.queue tbody tr')];
const daysLeft = (tr: Element) => {
  const m = /^(\d+)d (left|overdue)$/.exec(tr.querySelector('.days small')!.textContent!);
  return m ? (m[2] === 'left' ? Number(m[1]) : -Number(m[1])) : 0;
};

describe('UI B2/B3: triage summary and queue', () => {
  it('defaults to "Needs action": nothing far out, everything within 45 days or overdue', () => {
    renderAt('#/triage');
    const rows = queueRows();
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((tr) => expect(daysLeft(tr)).toBeLessThanOrEqual(45));
    const kpi = screen.getByRole('button', { name: /Needs action now/ });
    expect(kpi.textContent).toContain(String(rows.length));
  });

  it('has the six agreed columns', () => {
    renderAt('#/triage');
    const heads = [...document.querySelectorAll('.tbl.queue thead th')].map((th) => th.textContent);
    expect(heads).toEqual(['Supplier', 'Value', 'Decide by', 'Status', 'Owner', 'Action']);
  });

  it('clicking a summary number filters the queue', () => {
    renderAt('#/triage');
    screen.getByRole('button', { name: /Overcharges/ }).click();
    return Promise.resolve().then(() => {
      const names = queueRows().map((tr) => tr.querySelector('b')!.textContent);
      expect(names).toEqual(['BrightStaff Solutions']);
    });
  });

  it('uses red only for overdue and missed', () => {
    renderAt('#/triage');
    const reds = [...document.querySelectorAll('.tbl.queue .badge-red')].map((b) => b.textContent);
    reds.forEach((t) => expect(['Past decide-by', 'Auto-renewed (missed)']).toContain(t));
  });
});
