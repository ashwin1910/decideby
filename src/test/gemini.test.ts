import { describe, expect, it } from 'vitest';
import { pickModel } from '../../api/extract';

const m = (...names: string[]) => names.map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] }));

describe('Gemini model choice', () => {
  it('picks the newest stable full Flash model', () => {
    expect(
      pickModel(m('gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.8-flash-preview-09-2026', 'gemini-3.8-pro', 'gemini-3.8-flash-image')),
    ).toBe('gemini-3.8-flash');
  });
  it('falls back to Flash-Lite or a preview when that is all the key can use', () => {
    expect(pickModel(m('gemini-3.5-flash-lite', 'gemini-2.0-flash'))).toBe('gemini-3.5-flash-lite');
    expect(pickModel(m('gemini-3.8-flash-preview-09-2026'))).toBe('gemini-3.8-flash-preview-09-2026');
  });
  it('ignores models that cannot generate content, and returns null if none fit', () => {
    expect(pickModel([{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['embedContent'] }])).toBeNull();
    expect(pickModel(m('gemini-3.8-pro', 'text-embedding-004'))).toBeNull();
  });
});

describe('Gemini fallback order', () => {
  it('tries the best Flash-Lite, then the best Flash, then the next of each', async () => {
    const { fallbackChain } = await import('../../api/extract');
    const models = m('gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3-flash-preview');
    expect(fallbackChain(models)).toEqual(['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash']);
    expect(fallbackChain(models, 'gemini-2.5-flash')[0]).toBe('gemini-2.5-flash');
  });
});
