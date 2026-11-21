import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { click, renderAt } from './render';

const viewAs = (v: string) => fireEvent.change(screen.getByLabelText('Viewing as'), { target: { value: v } });

describe('UI B5: role switcher', () => {
  it('defaults to Procurement, so the demo is unchanged', () => {
    renderAt('#/triage');
    expect((screen.getByLabelText('Viewing as') as HTMLSelectElement).value).toBe('procurement');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Week 1: 14 contracts');
  });

  it('budget owner (Dana) sees only her renewals and only her briefs', () => {
    renderAt('#/triage');
    viewAs('owner');
    click('All');
    const owners = [...document.querySelectorAll('.tbl.queue tbody tr td:nth-child(5)')].map((td) => td.textContent);
    expect(owners.length).toBeGreaterThan(0);
    owners.forEach((o) => expect(o).toBe('Dana Okafor'));
    location.hash = '#/brief/lumen'; // Sam Patel's
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return screen.findByText('Not your brief');
  });

  it('Legal (Avery) sees letters waiting for approval and the review queue', async () => {
    renderAt('#/brief/brightstaff');
    click(/Record decision/); // large contract -> letter drafted, needs Legal
    viewAs('legal');
    location.hash = '#/triage';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await screen.findByText('Letters waiting for Legal approval');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('1 letter waiting for your approval');
    expect(screen.getByRole('button', { name: 'Review letter for BrightStaff Solutions' })).toBeTruthy();
    expect(document.body.textContent).toContain('Legal review queue');
  });
});
