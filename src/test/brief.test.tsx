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
    const record = screen.getByRole('button', { name: /Record decision: renew/i });
    expect((record as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/Ops relies on them/), { target: { value: 'Peak season, renegotiate next year' } });
    expect((record as HTMLButtonElement).disabled).toBe(false);
  });

  it('refuses to send once the notice window has closed', () => {
    renderAt('#/brief/northwind');
    setDay(25); // decided and approved inside the window...
    click(/Record decision/);
    click(/Approve as/);
    setDay(60); // ...but not sent before it closed on 15 Jan 2027
    expect(screen.getByText(/sending now would be invalid|Window closed/i)).toBeTruthy();
  });
});

describe('late decisions (fix 7)', () => {
  it('after the window closes, offers only mid-term negotiation or a next-cycle reminder', () => {
    renderAt('#/brief/northwind');
    setDay(60);
    expect(screen.getByRole('alert').textContent).toContain('The send window closed on 15 Jan 2027');
    expect(screen.queryByRole('button', { name: /^Exit/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Renegotiate/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Renewed: negotiate mid-term/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Set next-cycle reminder/ })).toBeTruthy();
    click(/Record decision: Renewed: negotiate mid-term/);
    expect(document.body.textContent).toContain('the contract has renewed');
    expect(screen.queryByRole('button', { name: /Approve as/ })).toBeNull();
  });

  it('dates a drafted letter with the simulated current date', () => {
    renderAt('#/brief/brightstaff');
    setDay(10); // 3 Dec 2026
    click(/Record decision/);
    expect(document.querySelector('.letter')!.textContent!.startsWith('3 Dec 2026')).toBe(true);
    renderAt('#/brief/northwind'); // held letter: dated today, not the window-open date
    click(/Record decision/);
    const letters = [...document.querySelectorAll('.letter')].map((l) => l.textContent!.slice(0, 11));
    expect(letters).not.toContain('16 Dec 2026');
  });
});
