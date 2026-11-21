import { describe, expect, it } from 'vitest';
import { click, renderAt, setDay } from './render';

const current = () => document.querySelector('.stepper li[aria-current="step"]')?.textContent ?? '';

describe('UI B4: brief puts the decision first', () => {
  it('decision card comes before the evidence; rate check is open when there is an overcharge', () => {
    renderAt('#/brief/brightstaff');
    const decision = document.querySelector('.decision-card')!;
    const evidence = document.querySelector('.evidence')!;
    expect(decision.compareDocumentPosition(evidence) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const sections = [...document.querySelectorAll('details.section')];
    const rate = sections.find((d) => d.textContent!.startsWith('Rate check'))! as HTMLDetailsElement;
    expect(rate.open).toBe(true);
    const terms = sections.find((d) => d.textContent!.startsWith('Terms in force'))! as HTMLDetailsElement;
    expect(terms.open).toBe(false);
  });

  it('stepper walks Decide -> Approve -> Dispatch -> Outcome', () => {
    renderAt('#/brief/northwind');
    expect(current()).toContain('Decide');
    click(/Record decision/);
    expect(current()).toContain('Approve');
    click(/Approve as/);
    expect(current()).toContain('Dispatch');
    setDay(25);
    click('Generate dispatch pack');
    expect(current()).toContain('Dispatch');
  });

  it('Northwind rate check stays collapsed (nothing to flag)', () => {
    renderAt('#/brief/northwind');
    const rate = [...document.querySelectorAll('details.section')].find((d) => d.textContent!.startsWith('Rate check'))! as HTMLDetailsElement;
    expect(rate.open).toBe(false);
  });
});
