import { describe, expect, it } from 'vitest';
import { recommendMusicCategory, CATEGORY_TEMPO } from './musicIntelligence.js';

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

describe('tempo targets', () => {
  it('attaches the researched calm range when stress drives the pick', () => {
    const result = recommendMusicCategory({ stress: 78, recovery: 60, hourOfDay: 14 });
    expect(result.category).toBe('Relax');
    expect(result.tempo).toMatchObject({ minBpm: 60, maxBpm: 80, researched: true });
  });

  it('attaches the training range for Workout', () => {
    expect(CATEGORY_TEMPO.Workout).toMatchObject({ minBpm: 120, maxBpm: 140, researched: true });
  });

  it('omits tempo entirely for Focus rather than inventing a number', () => {
    // The honesty case. Background-music-and-cognition research does not
    // converge on a tempo, so a "focus BPM" would be a guess wearing the
    // same clothes as the two findings that are real.
    const result = recommendMusicCategory({ stress: 30, recovery: 70, hourOfDay: 11 });
    expect(result.category).toBe('Focus');
    expect(result.tempo).toBeUndefined();
  });

  it('omits tempo for Morning too', () => {
    const result = recommendMusicCategory({ stress: 30, recovery: 70, hourOfDay: 7 });
    expect(result.category).toBe('Morning');
    expect(result.tempo).toBeUndefined();
  });

  it('states a basis for every tempo target it does define', () => {
    for (const [category, tempo] of Object.entries(CATEGORY_TEMPO)) {
      expect(tempo!.basis.length, `${category} needs a stated basis`).toBeGreaterThan(30);
      expect(tempo!.minBpm).toBeLessThan(tempo!.maxBpm);
    }
  });
});
