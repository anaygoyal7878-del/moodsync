import { describe, expect, it } from 'vitest';
import { recommendMusicCategory } from './musicIntelligence.js';

describe('recommendMusicCategory', () => {
  it('prioritizes rain/storm weather over everything else', () => {
    const result = recommendMusicCategory({ stress: 90, recovery: 10, hourOfDay: 14, weatherCondition: 'rain' });
    expect(result.category).toBe('Rainy Day');
  });

  it('recommends Relax when stress is elevated (weather not rainy)', () => {
    const result = recommendMusicCategory({ stress: 70, recovery: null, hourOfDay: 14, weatherCondition: 'clear' });
    expect(result.category).toBe('Relax');
  });

  it('recommends Morning during the early-morning window', () => {
    const result = recommendMusicCategory({ stress: null, recovery: null, hourOfDay: 7 });
    expect(result.category).toBe('Morning');
  });

  it('recommends Recovery when recovery score is low outside the morning window', () => {
    const result = recommendMusicCategory({ stress: null, recovery: 25, hourOfDay: 14 });
    expect(result.category).toBe('Recovery');
  });

  it('recommends Focus during working hours with no stronger signal', () => {
    const result = recommendMusicCategory({ stress: null, recovery: null, hourOfDay: 11 });
    expect(result.category).toBe('Focus');
  });

  it('falls back to Relax outside working hours with no stronger signal', () => {
    const result = recommendMusicCategory({ stress: null, recovery: null, hourOfDay: 21 });
    expect(result.category).toBe('Relax');
  });
});
