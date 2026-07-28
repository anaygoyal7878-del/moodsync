import type { WellnessScore, WellnessScores } from './wellness.js';

export interface CaffeineLogInput {
  mg: number;
  loggedAt: Date;
}

export interface LiveEnergyMeter extends WellnessScore {
  /** How many points of `value` came from recent caffeine, so the UI can
   * show "+6 from caffeine" as a temporary, decaying boost rather than
   * folding it invisibly into one number. 0 when no recent logs. */
  caffeineBoost: number;
}

/** Caffeine's plasma half-life is commonly cited around 5 hours for a
 * healthy adult (Mayo Clinic, "Caffeine: How much is too much?") — used
 * here only to bound the decay *window*, not as a pharmacokinetic model.
 * Effect is modeled as a simple linear decay to 0 over this window, not
 * an exponential curve — deliberately the simplest heuristic that still
 * captures "recent coffee helps, five-hour-old coffee doesn't." */
const CAFFEINE_DECAY_HOURS = 5;

/** 200mg (roughly two cups of coffee) of *fully-fresh* caffeine maps to
 * the maximum +15-point boost — a heuristic anchor, not a dose-response
 * curve backed by research on subjective energy. Effect is capped so a
 * user who logs several drinks back-to-back doesn't see an unbounded
 * score. */
const MG_FOR_MAX_BOOST = 200;
const MAX_CAFFEINE_BOOST = 15;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Sum of each log's remaining linear-decay effect, in "effective mg" —
 * a log at t=0 counts fully, one at CAFFEINE_DECAY_HOURS or later counts
 * for nothing. */
function effectiveCaffeineMg(logs: CaffeineLogInput[], now: Date): number {
  return logs.reduce((total, log) => {
    const hoursSince = (now.getTime() - log.loggedAt.getTime()) / (60 * 60_000);
    if (hoursSince < 0 || hoursSince >= CAFFEINE_DECAY_HOURS) return total;
    const remaining = 1 - hoursSince / CAFFEINE_DECAY_HOURS;
    return total + log.mg * remaining;
  }, 0);
}

/**
 * Live Energy Meter (0-100, "battery"-style) — a composite distinct from
 * `computeEnergyScore` (which is a plain passthrough of a provider's
 * activityLevel). This blends sleep, recovery, stress, and activity into
 * one base score, then applies a temporary, decaying boost from recent
 * manually-logged caffeine. **Heuristic** — no accepted clinical formula
 * combines these into a single "energy" number; see
 * docs/LIVE_ENERGY_METER.md for the full rationale.
 *
 * Base weights mirror `computeOverallScore`'s rationale (recovery and
 * sleep are the primary drivers of felt energy; stress and activity are
 * secondary) but are not identical to it — activity/exercise level is
 * weighted lower here since high recent exertion often *reduces*
 * immediate energy even though it's a positive activityLevel score,
 * which `computeOverallScore` doesn't attempt to distinguish.
 */
export function computeLiveEnergyMeter(
  scores: Pick<WellnessScores, 'sleep' | 'recovery' | 'stress' | 'energy'>,
  caffeineLogs: CaffeineLogInput[],
  now: Date = new Date(),
): LiveEnergyMeter {
  const weighted: Array<{ value: number; weight: number }> = [];
  if (scores.recovery.value !== null) weighted.push({ value: scores.recovery.value, weight: 0.35 });
  if (scores.sleep.value !== null) weighted.push({ value: scores.sleep.value, weight: 0.35 });
  if (scores.stress.value !== null) weighted.push({ value: 100 - scores.stress.value, weight: 0.2 });
  if (scores.energy.value !== null) weighted.push({ value: scores.energy.value, weight: 0.1 });

  const relevantCaffeine = caffeineLogs.filter((log) => {
    const hoursSince = (now.getTime() - log.loggedAt.getTime()) / (60 * 60_000);
    return hoursSince >= 0 && hoursSince < CAFFEINE_DECAY_HOURS;
  });
  const caffeineBoost =
    relevantCaffeine.length === 0
      ? 0
      : Math.round(clamp((effectiveCaffeineMg(relevantCaffeine, now) / MG_FOR_MAX_BOOST) * MAX_CAFFEINE_BOOST, 0, MAX_CAFFEINE_BOOST));

  if (weighted.length === 0) {
    // No biometric basis at all — caffeine alone isn't enough to report a
    // meaningful energy level, same "missing inputs -> null" convention
    // as every other score in wellness.ts.
    return { value: null, basis: 'heuristic', caffeineBoost: 0 };
  }

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  const base = weighted.reduce((sum, w) => sum + w.value * w.weight, 0) / totalWeight;
  const value = Math.round(clamp(base + caffeineBoost, 0, 100));

  return { value, basis: 'heuristic', caffeineBoost };
}
