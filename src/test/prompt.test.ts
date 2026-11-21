import { describe, expect, it } from 'vitest';
import * as server from '../../api/extract';
import * as shown from '../lib/prompt';

describe('the prompt shown on the Evaluation page', () => {
  it('is exactly the prompt the server sends', () => {
    expect(shown.SYSTEM).toBe(server.SYSTEM);
    expect([...shown.TERM_KEYS]).toEqual([...server.TERM_KEYS]);
    expect(shown.TERM_HELP).toEqual(server.TERM_HELP);
  });
});

describe('Evaluation page', () => {
  it('shows the prompt and points to running it live', async () => {
    const { screen } = await import('@testing-library/react');
    const { renderAt } = await import('./render');
    renderAt('#/evaluation');
    expect(screen.getByRole('heading', { name: 'Prompt' })).toBeTruthy();
    expect(document.body.textContent).toContain('Later-signed amendments override the original agreement');
    expect(document.body.textContent).toContain('- noticeAddress: where and by what method notices must be delivered');
    expect(document.body.textContent).toContain("Run live on any contract record to see the model's extraction checked against the quotes.");
    expect(document.body.textContent).not.toContain('has not been done');
  });
});
