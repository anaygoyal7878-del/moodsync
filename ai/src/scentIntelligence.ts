import type { MoodState } from './stateEngine.js';
import {
  ALL_SCENTS,
  PULSE_POINTS,
  MAX_PULSE_POINTS,
  NOTE_TIMING,
  type PulsePoint,
  type Scent,
  type ScentId,
} from './scentLibrary.js';

/**
 * Scent Intelligence — which Nature's Note fragrance suits this moment,
 * and where to put it.
 *
 * Cologne is a new *channel* for the Adaptive Environment engine, and
 * it is permanently `manual_only`: MoodSync obviously cannot spray
 * anyone. That constraint is not a limitation to work around, it's the
 * whole shape of the feature — this module produces advice with
 * reasons, never a pending action.
 *
 * Three inputs, deliberately weighted in this order:
 *
 *  1. **Occasion** — the strongest signal when the user gives one. A
 *     wedding wants a different answer than a gym session regardless of
 *     heart rate.
 *  2. **Time of day** — the site's own note timing makes this real:
 *     top notes burn off in 30 minutes, so *when* you apply relative to
 *     an event matters as much as what.
 *  3. **Biometric state** — the softest of the three. It nudges
 *     intensity (a low-energy morning can use a brighter lift) but is
 *     never allowed to override an explicit occasion.
 *
 * Nothing here claims a fragrance changes how you feel. Scent-and-mood
 * research exists but is not settled enough for a product to assert a
 * physiological effect, and MoodSync does not measure one. The language
 * is always about fit and appropriateness — "suits", "matches",
 * "reads" — never "will calm you" or "will boost your energy".
 */

export type Occasion =
  | 'work'
  | 'date'
  | 'formal_event'
  | 'casual_outing'
  | 'workout'
  | 'travel'
  | 'home'
  | 'unspecified';

export const OCCASION_LABELS: Record<Occasion, string> = {
  work: 'Work',
  date: 'A date',
  formal_event: 'Formal event',
  casual_outing: 'Casual outing',
  workout: 'Workout',
  travel: 'Travel',
  home: 'At home',
  unspecified: 'Not specified',
};

export interface ScentRecommendationInput {
  /** Local hour 0-23. */
  localHour: number;
  occasion: Occasion;
  /** From the State Engine. `unknown` is fine and common — the engine
   * still recommends on time and occasion alone. */
  state: MoodState;
  /** Which fragrances the user actually owns. Empty means "recommend
   * from the full collection", which reads as shopping guidance rather
   * than a wear suggestion — the caller distinguishes them. */
  owned: ScentId[];
}

export interface ScentRecommendation {
  scent: Scent;
  /** 0-1, how well this fit the moment relative to the alternatives.
   * Never presented as a probability — it orders a shortlist. */
  fit: number;
  /** Plain-language reasons, most significant first. Always at least
   * one — an unexplained fragrance suggestion is just an ad. */
  reasons: string[];
  /** Where to apply, capped at the site's own 2-point maximum. */
  pulsePoints: Array<{ point: PulsePoint; label: string; note: string }>;
  /** Timing advice grounded in the brand's published note bands. */
  timing: string;
  /** Runners-up, so the card can offer an alternative without a second
   * round trip. */
  alternatives: Array<{ scent: Scent; fit: number }>;
}

/**
 * What each occasion wants, on the same axes `scentLibrary.ts` scores
 * each fragrance on. Data rather than branching, same reasoning as the
 * composer's INTENTS table.
 *
 * `projectionPreference` is separate from intensity on purpose: a
 * formal event wants a *present* fragrance applied to *cool* points
 * (long-lasting, not overwhelming at a dinner table), which is a
 * different question from how bold the juice itself is.
 */
interface OccasionProfile {
  brightness: number;
  intensity: number;
  warmth: number;
  projectionPreference: 'strong' | 'moderate' | 'subtle';
  /** Weight of this occasion's opinion, 0-1. `unspecified` is 0 — with
   * no occasion, time and state decide alone. */
  weight: number;
}

const OCCASION_PROFILES: Record<Occasion, OccasionProfile> = {
  work: { brightness: 0.7, intensity: 0.4, warmth: 0.45, projectionPreference: 'subtle', weight: 0.9 },
  date: { brightness: 0.35, intensity: 0.7, warmth: 0.75, projectionPreference: 'moderate', weight: 1 },
  formal_event: { brightness: 0.3, intensity: 0.8, warmth: 0.7, projectionPreference: 'subtle', weight: 1 },
  casual_outing: { brightness: 0.7, intensity: 0.5, warmth: 0.45, projectionPreference: 'moderate', weight: 0.7 },
  // Deliberately low intensity: heat and exertion amplify projection,
  // so a bold fragrance in a gym is the classic over-application
  // mistake. MoodSync steers away from it rather than matching
  // "high energy" to "high intensity".
  workout: { brightness: 0.8, intensity: 0.15, warmth: 0.25, projectionPreference: 'subtle', weight: 0.9 },
  travel: { brightness: 0.6, intensity: 0.25, warmth: 0.4, projectionPreference: 'subtle', weight: 0.8 },
  home: { brightness: 0.5, intensity: 0.25, warmth: 0.6, projectionPreference: 'subtle', weight: 0.5 },
  unspecified: { brightness: 0.5, intensity: 0.5, warmth: 0.5, projectionPreference: 'moderate', weight: 0 },
};

/** Daylight shapes what reads as appropriate: bright and light early,
 * deeper and warmer after dark. A widely-held convention in fragrance
 * wearing, not a measured effect — and treated as a mild preference,
 * never a rule. */
function timeOfDayProfile(hour: number): { brightness: number; warmth: number; label: string } {
  if (hour >= 5 && hour < 11) return { brightness: 0.85, warmth: 0.35, label: 'morning' };
  if (hour >= 11 && hour < 17) return { brightness: 0.6, warmth: 0.45, label: 'daytime' };
  if (hour >= 17 && hour < 21) return { brightness: 0.35, warmth: 0.7, label: 'evening' };
  return { brightness: 0.2, warmth: 0.8, label: 'night' };
}

/**
 * How the biometric state nudges intensity. Weak on purpose — see the
 * file header. A tired morning can carry a brighter fragrance as a
 * pick-me-up; a stressed or overstimulated moment wants less, not more,
 * sensory input.
 */
function stateIntensityBias(state: MoodState): { intensity: number; note: string | null } {
  switch (state) {
    case 'stressed':
    case 'overstimulated':
      return { intensity: -0.2, note: 'something lighter, since your signals are already elevated' };
    case 'tired':
    case 'sleepy':
      return { intensity: 0.1, note: 'a brighter opening for a low-energy start' };
    case 'preparing_for_sleep':
      return { intensity: -0.3, note: 'minimal, if anything, this close to bed' };
    case 'energized':
    case 'active':
      return { intensity: 0.05, note: null };
    default:
      return { intensity: 0, note: null };
  }
}

/** Distance on the three character axes, converted to a 0-1 fit. */
function fitScore(scent: Scent, target: { brightness: number; intensity: number; warmth: number }): number {
  const d =
    Math.abs(scent.character.brightness - target.brightness) * 0.4 +
    Math.abs(scent.character.intensity - target.intensity) * 0.35 +
    Math.abs(scent.character.warmth - target.warmth) * 0.25;
  return Math.max(0, 1 - d);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Picks placements matching the occasion's projection preference,
 * capped at the brand's own 2-point maximum. */
function choosePulsePoints(preference: 'strong' | 'moderate' | 'subtle'): PulsePoint[] {
  const ordered = Object.values(PULSE_POINTS)
    .sort((a, b) => (a.projection === preference ? -1 : b.projection === preference ? 1 : 0))
    .map((p) => p.id);
  return ordered.slice(0, MAX_PULSE_POINTS);
}

function timingAdvice(occasion: Occasion): string {
  // Grounded in the brand's own published bands: top notes are gone in
  // ~30 minutes, so applying at the door means people meet the opening
  // rather than the heart.
  if (occasion === 'date' || occasion === 'formal_event') {
    return `Apply about ${NOTE_TIMING.topMinutes} minutes before you leave — the bright opening notes fade in that window, so people meet the heart of the scent rather than the first spray.`;
  }
  if (occasion === 'workout') {
    return 'If at all, apply lightly and well before — heat and exertion push projection up sharply.';
  }
  return `Top notes last about ${NOTE_TIMING.topMinutes} minutes, the heart around ${NOTE_TIMING.heartHours} hours, and the base ${NOTE_TIMING.baseLabel}.`;
}

/**
 * The recommendation. Returns null only when the user owns nothing and
 * the caller asked to restrict to owned fragrances — otherwise there is
 * always a best fit among the collection.
 */
export function recommendScent(input: ScentRecommendationInput): ScentRecommendation | null {
  const candidates = input.owned.length > 0 ? ALL_SCENTS.filter((s) => input.owned.includes(s.id)) : ALL_SCENTS;
  if (candidates.length === 0) return null;

  const occasion = OCCASION_PROFILES[input.occasion];
  const time = timeOfDayProfile(input.localHour);
  const stateBias = stateIntensityBias(input.state);

  // Occasion and time blend by the occasion's own weight, so an
  // unspecified occasion leaves time of day in charge rather than
  // dragging everything to the middle.
  const w = occasion.weight;
  const target = {
    brightness: clamp01(occasion.brightness * w + time.brightness * (1 - w)),
    intensity: clamp01(occasion.intensity * w + 0.5 * (1 - w) + stateBias.intensity),
    warmth: clamp01(occasion.warmth * w + time.warmth * (1 - w)),
  };

  const ranked = candidates
    .map((scent) => ({ scent, fit: fitScore(scent, target) }))
    .sort((a, b) => b.fit - a.fit);

  const best = ranked[0]!;

  const reasons: string[] = [];
  if (input.occasion !== 'unspecified') {
    reasons.push(`${OCCASION_LABELS[input.occasion]} calls for something ${describeTarget(target)}.`);
  } else {
    reasons.push(`For ${time.label}, something ${describeTarget(target)} tends to sit right.`);
  }
  reasons.push(`${best.scent.name} — ${best.scent.description}`);
  if (stateBias.note) {
    reasons.push(`Your current state suggests ${stateBias.note}.`);
  }
  if (best.scent.notes) {
    reasons.push(
      `Opens with ${best.scent.notes.top.join(', ').toLowerCase()}, settles into ${best.scent.notes.heart
        .join(', ')
        .toLowerCase()}.`,
    );
  }

  const points = choosePulsePoints(occasion.projectionPreference);

  return {
    scent: best.scent,
    fit: Number(best.fit.toFixed(2)),
    reasons,
    pulsePoints: points.map((id) => ({
      point: id,
      label: PULSE_POINTS[id].label,
      note: PULSE_POINTS[id].note,
    })),
    timing: timingAdvice(input.occasion),
    alternatives: ranked.slice(1).map((r) => ({ scent: r.scent, fit: Number(r.fit.toFixed(2)) })),
  };
}

function describeTarget(t: { brightness: number; intensity: number; warmth: number }): string {
  const parts: string[] = [];
  if (t.brightness >= 0.65) parts.push('bright');
  else if (t.brightness <= 0.3) parts.push('deep');
  if (t.intensity <= 0.3) parts.push('restrained');
  else if (t.intensity >= 0.7) parts.push('bold');
  if (t.warmth >= 0.65) parts.push('warm');
  return parts.length > 0 ? parts.join(' and ') : 'balanced';
}
