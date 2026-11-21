import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderAt, setDay, click } from './render';
import { STAGE_LABEL } from '../lib/logic';

const tile = (label: string) => {
  const el = [...document.querySelectorAll('.pipe')].find((p) => p.querySelector('.pipe-l')!.textContent === label)!;
  return Number(el.querySelector('.pipe-n')!.textContent);
};
const column = (label: string) => {
  const body = document.querySelector('.tbl tbody') as HTMLElement;
  return within(body).queryAllByText(label, { selector: '.badge' }).length;
};

describe('stage tiles agree with the status column', () => {
  it('on day 0, Mosaic, Prism and Crestline are past decide-by', () => {
    renderAt('#/triage');
    click('All');
    expect(tile(STAGE_LABEL.overdue)).toBe(3);
    const rows = [...document.querySelectorAll('.tbl tbody tr')].filter((r) => r.textContent!.includes('Past decide-by'));
    expect(rows.map((r) => r.querySelector('b')!.textContent).sort()).toEqual(['Crestline Staffing', 'Mosaic Events', 'Prism Print & Promo']);
  });

  it.each([0, 3, 4, 5, 6, 10, 30, 45, 60, 90, 120, 180, 270])('on day %i every tile equals its column count', (day) => {
    renderAt('#/triage');
    click('All');
    setDay(day);
    for (const label of Object.values(STAGE_LABEL)) expect(tile(label), `${label} day ${day}`).toBe(column(label));
  });

  it('marks undecided contracts as auto-renewed (missed) once the notice deadline passes', () => {
    renderAt('#/triage');
    setDay(6); // 29 Nov 2026: Mosaic and Prism notice deadlines (28 Nov) have passed
    expect(tile(STAGE_LABEL.missed)).toBe(2);
    click('Missed');
    expect(screen.getAllByText(STAGE_LABEL.missed, { selector: '.badge' })).toHaveLength(2);
  });
});
