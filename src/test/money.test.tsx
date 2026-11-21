import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { CONTRACTS } from '../data/seed';
import { priceBaseline } from '../lib/logic';
import { click, renderAt } from './render';

const bright = CONTRACTS.find((c) => c.id === 'brightstaff')!;

describe('BrightStaff numbers a CFO would challenge (fix 9)', () => {
  it('baseline excludes overbilling and treats the 6% as already contracted', () => {
    const p = priceBaseline(bright);
    expect(p.contracted).toBe(true);
    expect(p.overbilled).toBe(2734);
    expect(p.baseline).toBe(209515);
    expect(p.explain).toContain('already contracted from 1 Jan 2027');
  });

  it('brief labels the increase as contracted, not "if it auto-renews"', () => {
    renderAt('#/brief/brightstaff');
    expect(document.body.textContent).not.toContain('If it auto-renews');
    expect(document.body.textContent).toContain('+6% contracted from 1 Jan 2027');
    expect(document.body.textContent).toContain('inside the current term (which ends 4 Apr 2027)');
  });

  it('requests a credit note and carries it into the outcome as Recovered', () => {
    renderAt('#/brief/brightstaff');
    click('Request credit note');
    expect(document.body.textContent).toContain('Please issue a credit note for $4,114');
    expect(document.body.textContent).toContain('Pat Oduya');
    click(/^Renew/);
    fireEvent.change(screen.getByPlaceholderText(/Ops relies on them/), { target: { value: 'Keep for peak season' } });
    click(/Record decision: renew/i);
    expect((screen.getByLabelText(/Recovered/) as HTMLInputElement).value).toBe('4114');
    click('Record outcome');
    expect(document.body.textContent).toContain('Recovered (credits)$4,114');
    expect(document.body.textContent).toContain('Savings vs baseline');
  });
});
