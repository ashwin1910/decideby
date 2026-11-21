import { describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import { click, renderAt } from './render';

describe('Reset demo', () => {
  it('clears decisions from storage and memory, so a reload starts clean', () => {
    const view = renderAt('#/brief/quill');
    click(/Confirm/);
    expect(JSON.parse(localStorage.getItem('decideby.records.v1')!).quill).toBeTruthy();
    localStorage.setItem('decideby.something.v0', 'stale');

    act(() => click('Reset demo'));
    expect(Object.keys(localStorage).filter((k) => k.startsWith('decideby.'))).toEqual([]);

    // simulate a reload
    view.unmount();
    renderAt('#/triage');
    expect(screen.queryAllByText('Decided', { selector: '.badge' })).toHaveLength(0);
  });
});
