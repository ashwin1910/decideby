import { describe, expect, it } from 'vitest';
import { renderAt } from './render';

describe('Case tab', () => {
  it('links every evidence source, opening in a new tab', () => {
    renderAt('#/case');
    const evidence = [...document.querySelectorAll('.card')].find((c) => c.querySelector('h3')?.textContent === '3 · The problem and the evidence')!;
    const rows = [...evidence.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(8);
    rows.forEach((tr) => {
      const a = tr.querySelector('td:last-child a') as HTMLAnchorElement;
      expect(a, tr.textContent!).toBeTruthy();
      expect(a.href).toMatch(/^https:\/\//);
      expect(a.target).toBe('_blank');
      expect(a.rel).toContain('noreferrer');
    });
  });

  it('has a Sources section and says 14 terms', () => {
    renderAt('#/case');
    expect(document.querySelectorAll('.sources-list a').length).toBeGreaterThanOrEqual(17);
    expect(document.body.textContent).toContain('14 terms');
    expect(document.body.textContent).not.toMatch(/about 12 terms|~12 terms/);
  });
});
