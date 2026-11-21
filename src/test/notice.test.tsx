import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { CONTRACTS } from '../data/seed';
import { click, renderAt, setDay } from './render';

describe('notice delivery follows the contract', () => {
  it('reads the method from the notice clause', () => {
    const m = (id: string) => CONTRACTS.find((c) => c.id === id)!.notice.method;
    expect([m('brightstaff'), m('northwind'), m('crestline-staffing')]).toEqual(['courier', 'certified', 'email']);
  });

  it('Northwind (certified mail): dispatch pack, then mark dispatched with a tracking number', () => {
    renderAt('#/brief/northwind');
    setDay(25); // 18 Dec 2026, window open
    click(/Record decision/);
    click(/Approve as/);
    expect(screen.queryByRole('button', { name: /Send from procurement mailbox|Send by email/ })).toBeNull();
    click('Generate dispatch pack');
    const mark = screen.getByRole('button', { name: 'Mark dispatched' }) as HTMLButtonElement;
    expect(mark.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Tracking number'), { target: { value: '7019 0700 0001' } });
    click('Mark dispatched');
    expect(document.body.textContent).toContain('Sent by certified mail, return receipt requested, to Northwind Freight');
    expect(document.body.textContent).toContain('Tracking no. 7019 0700 0001');
    expect(document.body.textContent).not.toContain('Sent from the procurement mailbox');
  });

  it('Crestline (email): sends by email and says so in the footer', () => {
    renderAt('#/brief/crestline-staffing');
    click(/Record decision/);
    click(/Approve as/);
    click(/Send by email to legal@crestline.example/);
    expect(document.body.textContent).toContain('Sent by email from the procurement mailbox to legal@crestline.example.');
  });
});
