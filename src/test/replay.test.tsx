import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { CONTRACTS } from '../data/seed';
import { computeDates } from '../lib/logic';
import { diffTerms, precomputedExtraction, replayExtraction, REPLAY_STEP_MS, REPLAY_STEPS } from '../lib/replay';
import { renderAt } from './render';

const bright = CONTRACTS.find((c) => c.id === 'brightstaff')!;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('simulated extraction replay', () => {
  it('renders the simulated result after the animation, with no network call', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, 'open');
    vi.useFakeTimers();
    renderAt('#/contract/brightstaff');
    expect(screen.getByText(/Demo uses pre-computed AI extraction; in production this step runs an LLM \(e\.g\. Claude\)/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '↻ Replay extraction (simulated)' }));
    const status = screen.getByRole('status', { name: 'Replaying extraction' });
    expect(status.textContent).toContain('Reading documents');
    act(() => {
      vi.advanceTimersByTime(REPLAY_STEP_MS * 2);
    });
    expect(screen.getByRole('status', { name: 'Replaying extraction' }).textContent).toContain('✓ Extracting 14 terms');
    act(() => {
      vi.advanceTimersByTime(REPLAY_STEP_MS * REPLAY_STEPS.length);
    });

    expect(screen.queryByRole('status', { name: 'Replaying extraction' })).toBeNull();
    expect(screen.getByText('Simulated replay · 14 of 14 quotes found verbatim · dates unchanged')).toBeTruthy();
    expect(screen.getByText('14 matched')).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrOpen).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('the animation lasts between 1.5 and 2 seconds', () => {
    const total = REPLAY_STEP_MS * REPLAY_STEPS.length;
    expect(total).toBeGreaterThanOrEqual(1500);
    expect(total).toBeLessThanOrEqual(2000);
  });

  it('runs the real quote check: a paraphrased quote is caught', () => {
    const granite = CONTRACTS.find((c) => c.id === 'granite-data-warehouse')!;
    const r = replayExtraction(granite, computeDates(granite));
    expect(r.verified).toBe(13);
    expect(r.rows.find((x) => x.key === 'liability')!.quoteVerified).toBe(false);
  });

  it('diffs matched / changed / missing term by term', () => {
    const extracted = precomputedExtraction(bright);
    extracted.find((t) => t.key === 'liability')!.quote = 'A sentence that is not in the contract.';
    const rows = diffTerms(bright, extracted.filter((t) => t.key !== 'law'));
    const by = (k: string) => rows.find((r) => r.key === k)!;
    expect(by('notice').status).toBe('matched');
    expect(by('notice').quoteVerified).toBe(true);
    expect(by('liability').status).toBe('changed');
    expect(by('liability').quoteVerified).toBe(false);
    expect(by('law').status).toBe('missing');
  });
});
