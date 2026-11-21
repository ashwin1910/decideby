import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { click, renderAt, setDay } from './render';

describe('owner brief guards', () => {
  it('holds the approved Northwind letter until the window opens on 16 Dec 2026', () => {
    renderAt('#/brief/northwind');
    click(/Record decision/);
    click(/Approve as/);
    expect(screen.getByText(/Held until the window opens/).textContent).toContain('16 Dec 2026');
  });

  it('needs a reason to override the recommendation', () => {
    renderAt('#/brief/brightstaff');
    click(/^Renew/);
    const record = screen.getByRole('button', { name: /Record decision: renew/ });
    expect((record as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/Ops relies on them/), { target: { value: 'Peak season, renegotiate next year' } });
    expect((record as HTMLButtonElement).disabled).toBe(false);
  });

  it('refuses to send once the notice window has closed', () => {
    renderAt('#/brief/northwind');
    setDay(60); // 22 Jan 2027, after the 15 Jan close
    click(/Record decision/);
    click(/Approve as/);
    expect(screen.getByText(/sending now would be invalid|Window closed/i)).toBeTruthy();
  });
});
