import type { PersonalBaselines } from './personalBaselines.js';

/**
 * Researched physiological scenarios — the patterns in someone's own
 * data that published work says are worth saying out loud.
 *
 * Everything else in this codebase that interprets biometrics does it
 * with MoodSync's own heuristics, and says so (see
 * `docs/WELLNESS_SCORING.md`, and the "MoodSync's own engineering
 * judgment" note in `musicIntelligence.ts`). This module is the
 * deliberate exception: each scenario below has a threshold taken from
 * published research rather than invented, and each carries that
 * provenance in a `basis` string so the app can show its work instead of
 * asking to be trusted.
 *
 * ## The rules this module holds itself to
 *
 * **Personal baselines, never population norms.** Every threshold is
 * relative to this user's own recent history via `PersonalBaselines`.
 * Absolute HRV in particular varies several-fold between healthy adults,
 * so "your HRV is 42ms" means nothing without knowing that *your* normal
 * is 61ms. This is why nothing here fires until `compareToBaseline` has
 * `MIN_SAMPLES_FOR_BASELINE` points to work from.
 *
 * **Not a diagnosis, and phrased so it can't be mistaken for one.** The
 * illness scenario below is the one to be careful with: the research
 * describes a *statistical* early-warning signal across populations of
 * athletes, not a test that tells an individual they are getting sick.
 * Its guidance says to consider easing off, never to seek treatment, and
 * `isDiagnostic` is false on every scenario in this file.
 *
 * **Nothing fires on data MoodSync doesn't have.** Sleep *regularity*
 * (the Sleep Regularity Index) is the strongest single finding in this
 * literature — more predictive of mortality than sleep duration — and it
 * is deliberately absent here, because MoodSync stores sleep scores and
 * stage minutes but no bedtime or wake timestamps. `sleepCoach.ts` makes
 * the same call for the same reason. The honest version of a great
 * feature you can't compute is not a worse approximation labelled as the
 * real thing; it's leaving it out until the data exists.
 */

/** How far below personal baseline a metric must sit, in standard
 * deviations, before it counts as genuinely suppressed rather than
 * ordinary day-to-day noise.
 *
 * Chosen as a statistical convention rather than from a specific paper:
 * absolute HRV is not comparable between people, so the literature's
 * qualitative "a sudden unexplained drop in morning HRV" has to be
 * operationalised against the individual's own spread somehow. One SD
 * is the conservative reading — roughly the bottom ~16% of this person's
 * own recent days, so it fires on a real dip without firing weekly. */
const SUPPRESSED_Z = -1.0;

/** How many beats per minute above personal baseline resting heart rate
 * counts as elevated.
 *
 * This one *is* from the literature rather than a convention: an RHR
 * around 5 bpm above an athlete's own average is the commonly cited
 * marker that recovery is incomplete. Used as a raw bpm difference, not
 * a z-score, precisely because the research states it in bpm — and
 * because RHR's within-person spread is narrow enough that a z-score
 * would fire on trivial movement. */
const ELEVATED_RHR_BPM = 5;

export type HealthScenarioId =
  | 'strain-or-illness-warning'
  | 'incomplete-recovery'
  | 'suppressed-hrv'
  | 'sleep-quality-decline';

export type ScenarioSeverity = 'notice' | 'caution';

export interface HealthScenario {
  id: HealthScenarioId;
  severity: ScenarioSeverity;
  /** Short headline, safe to render on its own. */
  title: string;
  /** What is measurably true, with this user's own numbers in it. Never
   * an interpretation on its own — the numbers are always present so the
   * claim is checkable. */
  finding: string;
  /** What to consider doing. Behavioural only: rest, easier training,
   * an earlier night. Never clinical advice. */
  guidance: string;
  /** Where the threshold comes from, shown to the user. The point is
   * that someone can disagree with a scenario on its merits instead of
   * having to take it on faith. */
  basis: string;
  /** Always false. Present as an explicit, greppable assertion rather
   * than a comment, so any future scenario that wants to claim otherwise
   * has to change a value a reviewer can see. */
  isDiagnostic: false;
  /** Smallest sample size behind this scenario's inputs. Surfaced so a
   * finding off six nights never reads like one off six months. */
  sampleSize: number;
}

/**
 * Detects every researched scenario that currently applies.
 *
 * Pure and DB-free, matching the split the rest of `ai/` uses: callers
 * do the querying, this does the judging. Returns most-severe first;
 * an empty array means nothing in the research applies right now, which
 * is the normal, healthy case and should be presented as such rather
 * than as a failure to find anything.
 */
export function detectHealthScenarios(baselines: PersonalBaselines): HealthScenario[] {
  const scenarios: HealthScenario[] = [];
  const { restingHeartRate: rhr, heartRateVariability: hrv, sleepScore: sleep } = baselines;

  const hrvSuppressed = hrv !== null && hrv.z <= SUPPRESSED_Z;
  const rhrElevated = rhr !== null && rhr.value - rhr.baseline >= ELEVATED_RHR_BPM;

  // The two-signal case first. Either signal alone is common and weakly
  // informative; the research is specifically about their *combination*,
  // which is why this is not just two independent scenarios firing at
  // once. When it applies, the single-signal scenarios below are
  // suppressed so the user reads one clear finding instead of three
  // overlapping ones.
  if (hrvSuppressed && rhrElevated) {
    scenarios.push({
      id: 'strain-or-illness-warning',
      severity: 'caution',
      title: 'Your body is showing two stress signals at once',
      finding: `Your HRV is ${hrv.value.toFixed(0)}ms against your usual ${hrv.baseline.toFixed(0)}ms, and your resting heart rate is ${rhr.value.toFixed(0)}bpm against your usual ${rhr.baseline.toFixed(0)}bpm. Those two moving together is a more meaningful signal than either on its own.`,
      guidance:
        'This is the pattern that usually means an easy day rather than a hard one. Consider backing off training intensity, and treat an early night as the priority. If you do come down with something in the next day or two, this is often why.',
      basis:
        'Sports-science work on athlete monitoring describes suppressed HRV together with elevated resting heart rate as a fatigue or pre-illness signal, with HRV often dropping 24–48 hours before symptoms appear. This is a population-level statistical pattern, not a test that can tell you individually that you are ill.',
      isDiagnostic: false,
      sampleSize: Math.min(hrv.sampleSize, rhr.sampleSize),
    });
  } else {
    if (rhrElevated) {
      scenarios.push({
        id: 'incomplete-recovery',
        severity: 'notice',
        title: 'Your resting heart rate is up',
        finding: `Your resting heart rate is ${rhr.value.toFixed(0)}bpm, about ${Math.round(rhr.value - rhr.baseline)}bpm above your own recent average of ${rhr.baseline.toFixed(0)}bpm.`,
        guidance:
          'Commonly a sign recovery is not finished — from training, a short night, alcohol, or stress. An easier day tends to resolve it.',
        basis:
          'Athlete-monitoring guidance commonly treats a resting heart rate around 5bpm above someone’s own average as a marker that more recovery is needed. Measured against your baseline, not a population norm.',
        isDiagnostic: false,
        sampleSize: rhr.sampleSize,
      });
    }

    if (hrvSuppressed) {
      scenarios.push({
        id: 'suppressed-hrv',
        severity: 'notice',
        title: 'Your HRV is below your normal range',
        finding: `Your HRV is ${hrv.value.toFixed(0)}ms against a recent average of ${hrv.baseline.toFixed(0)}ms — roughly ${Math.abs(hrv.z).toFixed(1)} standard deviations below your own normal.`,
        guidance:
          'Lower HRV generally tracks with the nervous system being under load, whether that is training, poor sleep, or stress. A single low day is normal and not worth acting on; several in a row is worth easing off for.',
        basis:
          'HRV is interpreted here only against your own history, because absolute HRV varies several-fold between healthy people and cross-person comparison is not meaningful.',
        isDiagnostic: false,
        sampleSize: hrv.sampleSize,
      });
    }
  }

  if (sleep !== null && sleep.z <= SUPPRESSED_Z) {
    scenarios.push({
      id: 'sleep-quality-decline',
      severity: 'notice',
      title: 'Your sleep quality has dropped below your usual',
      finding: `Your sleep score is ${sleep.value.toFixed(0)} against a recent average of ${sleep.baseline.toFixed(0)}.`,
      guidance:
        'Worth protecting tonight rather than fixing tomorrow — a consistent wake time does more for this than a long lie-in does.',
      basis:
        'Compared against your own recent sleep scores. Note that MoodSync has no bedtime or wake timestamps, so this measures sleep *quality* as your provider scores it, not the schedule *regularity* that sleep research finds most predictive.',
      isDiagnostic: false,
      sampleSize: sleep.sampleSize,
    });
  }

  const order: Record<ScenarioSeverity, number> = { caution: 0, notice: 1 };
  return scenarios.sort((a, b) => order[a.severity] - order[b.severity]);
}
