import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { click, renderAt } from './render';

describe('UI B6: 3-minute tour and case link', () => {
  it('deep-links each step, including the search question', async () => {
    renderAt('#/triage');
    click('▶ 3-minute tour');
    click(/Next: BrightStaff/);
    await screen.findByText('BrightStaff Solutions', { selector: 'h1' });
    click(/4\. Ask a question/);
    await screen.findByText('Search and ask, with citations');
    expect((document.querySelector('.search input') as HTMLInputElement).value).toBe("which suppliers can we exit for convenience on 30 days' notice?");
    click(/5\. Move the slider/);
    await screen.findByText(/day 6 of the pilot/);
  });

  it('can be dismissed and stays dismissed', () => {
    const v = renderAt('#/triage');
    click('Dismiss tour');
    expect(screen.queryByText('▶ 3-minute tour')).toBeNull();
    v.unmount();
    renderAt('#/triage');
    expect(screen.queryByText('▶ 3-minute tour')).toBeNull();
  });

  it('triage header links to the case', async () => {
    renderAt('#/triage');
    click('Read the case →');
    await screen.findByText(/1 · Why this stage/);
  });
});
