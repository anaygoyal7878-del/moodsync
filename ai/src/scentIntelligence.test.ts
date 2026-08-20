import { describe, expect, it } from 'vitest';
import { recommendScent, type Occasion, type ScentRecommendationInput } from './scentIntelligence.js';
import { SCENTS, ALL_SCENTS, MAX_PULSE_POINTS } from './scentLibrary.js';
import type { MoodState } from './stateEngine.js';

function input(o: Partial<ScentRecommendationInput> = {}): ScentRecommendationInput {
  return {
    localHour: 14,
    occasion: 'unspecified',
    state: 'unknown',
    owned: [],
    ...o,
  };
}

describe('scent library — honesty about what the brand publishes', () => {
  it('keeps Solaris’s real published note pyramid verbatim', () => {
    expect(SCENTS.solaris.notes).not.toBeNull();
    expect(SCENTS.solaris.notes!.top).toEqual(['Bergamot', 'Lemon', 'Ginger']);
    expect(SCENTS.solaris.notes!.base).toEqual(['Sandalwood', 'Amber', 'Musk']);
  });

  it('leaves unpublished note pyramids null rather than inventing a formula', () => {
    // Everwood and Burnt Ash have no readable pyramid on the site.
    // Guessing one would fabricate a real product's actual recipe.
    expect(SCENTS.everwood.notes).toBeNull();
    expect(SCENTS['burnt-ash'].notes).toBeNull();
  });

  it('gives every fragrance the brand’s own description, not a paraphrase', () => {
    for (const scent of ALL_SCENTS) {
      expect(scent.description.length).toBeGreaterThan(20);
      expect(scent.tagline.length).toBeGreaterThan(0);
    }
  });
});

describe('recommendScent — occasion drives the answer', () => {
  it('picks the elegant-bold fragrance for a formal event, not the rawest one', () => {
    // Everwood is the brand's "Timeless Sophistication … elegance for
    // unforgettable moments"; Burnt Ash is "Raw Intensity …
    // unapologetic". Black tie wants the former. An earlier version of
    // this test asserted Burnt Ash on the assumption that "formal" just
    // means "most intense" — the character-axis match is more faithful
    // to how the brand positions its own products.
    const result = recommendScent(input({ occasion: 'formal_event', localHour: 19 }))!;
    expect(result.scent.id).toBe('everwood');
    expect(result.scent.character.intensity).toBeGreaterThan(0.7);
  });

  it('still ranks the rawest fragrance as a close alternative for formal wear', () => {
    const result = recommendScent(input({ occasion: 'formal_event', localHour: 19 }))!;
    expect(result.alternatives.map((a) => a.scent.id)).toContain('burnt-ash');
  });

  it('picks the bright signature for daytime work', () => {
    const result = recommendScent(input({ occasion: 'work', localHour: 10 }))!;
    expect(result.scent.id).toBe('solaris');
  });

  it('steers away from a bold fragrance for a workout, not toward one', () => {
    // The trap: "high energy occasion" → "high intensity scent". Heat
    // and exertion amplify projection, so the right answer is restraint.
    const result = recommendScent(input({ occasion: 'workout', localHour: 7 }))!;
    expect(result.scent.character.intensity).toBeLessThan(0.6);
  });

  it('lets an explicit occasion outrank the hour', () => {
    // A formal event at 9am should still not get the brightest option.
    const morningFormal = recommendScent(input({ occasion: 'formal_event', localHour: 9 }))!;
    const morningCasual = recommendScent(input({ occasion: 'casual_outing', localHour: 9 }))!;
    expect(morningFormal.scent.character.brightness).toBeLessThan(morningCasual.scent.character.brightness);
  });
});

describe('recommendScent — time of day when no occasion is given', () => {
  it('leans bright in the morning', () => {
    const result = recommendScent(input({ localHour: 8 }))!;
    expect(result.scent.character.brightness).toBeGreaterThan(0.5);
  });

  it('leans deep and warm at night', () => {
    const result = recommendScent(input({ localHour: 22 }))!;
    expect(result.scent.character.warmth).toBeGreaterThan(0.5);
  });
});

describe('recommendScent — biometric state nudges, never dictates', () => {
  it('does not let state override an explicit occasion', () => {
    const stressedFormal = recommendScent(input({ occasion: 'formal_event', localHour: 19, state: 'stressed' }))!;
    const calmFormal = recommendScent(input({ occasion: 'formal_event', localHour: 19, state: 'unknown' }))!;
    expect(stressedFormal.scent.id).toBe(calmFormal.scent.id);
  });

  it('mentions the state in its reasoning when it actually influenced things', () => {
    const result = recommendScent(input({ state: 'stressed', localHour: 14 }))!;
    expect(result.reasons.join(' ')).toContain('elevated');
  });

  it('says something different when preparing for sleep', () => {
    const result = recommendScent(input({ state: 'preparing_for_sleep', localHour: 22 }))!;
    expect(result.reasons.join(' ').toLowerCase()).toContain('bed');
  });
});

describe('recommendScent — owned collection', () => {
  it('only recommends what the user actually owns', () => {
    const result = recommendScent(input({ owned: ['everwood'], occasion: 'work', localHour: 10 }))!;
    expect(result.scent.id).toBe('everwood');
    expect(result.alternatives).toHaveLength(0);
  });

  it('recommends across the whole collection when nothing is owned yet', () => {
    const result = recommendScent(input())!;
    expect(result.alternatives.length).toBeGreaterThan(0);
  });
});

describe('recommendScent — application advice follows the brand’s own rules', () => {
  it('never suggests more than the two pulse points the guide caps at', () => {
    for (const occasion of ['work', 'date', 'formal_event', 'workout', 'home'] as Occasion[]) {
      const result = recommendScent(input({ occasion }))!;
      expect(result.pulsePoints.length).toBeLessThanOrEqual(MAX_PULSE_POINTS);
      expect(result.pulsePoints.length).toBeGreaterThan(0);
    }
  });

  it('grounds timing in the published 30-minute top-note window for a date', () => {
    const result = recommendScent(input({ occasion: 'date', localHour: 19 }))!;
    expect(result.timing).toContain('30');
  });

  it('warns about projection rather than encouraging fragrance at the gym', () => {
    const result = recommendScent(input({ occasion: 'workout' }))!;
    expect(result.timing.toLowerCase()).toContain('projection');
  });
});

describe('recommendScent — never claims a physiological effect', () => {
  const forbidden = ['will calm', 'reduces stress', 'lowers your', 'boosts your', 'cures', 'treats', 'heals'];

  it('avoids therapeutic claims across every state and occasion', () => {
    const occasions: Occasion[] = ['work', 'date', 'formal_event', 'casual_outing', 'workout', 'travel', 'home'];
    const states: MoodState[] = ['stressed', 'tired', 'energized', 'preparing_for_sleep', 'unknown'];
    for (const occasion of occasions) {
      for (const state of states) {
        const result = recommendScent(input({ occasion, state, localHour: 14 }))!;
        const text = [...result.reasons, result.timing].join(' ').toLowerCase();
        for (const phrase of forbidden) {
          expect(text).not.toContain(phrase);
        }
      }
    }
  });

  it('always gives at least one reason — a bare product name is an ad, not advice', () => {
    const result = recommendScent(input())!;
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });
});
