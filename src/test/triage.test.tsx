import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderAt } from './render';

describe('triage headline on day 0', () => {
  it('reads 14 contracts worth $813k', () => {
    renderAt('#/triage');
    const h = screen.getByRole('heading', { level: 1 }).textContent!;
    expect(h).toContain('14 contracts');
    expect(h).toContain('$813k');
  });
});
