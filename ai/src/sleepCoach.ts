/**
 * Sleep Coach — bedtime targeting and wind-down guidance.
 *
 * A deliberate note on what this does NOT do: MoodSync stores a sleep
 * *score* and stage minutes per reading (see
 * `NormalizedBiometricReading`), but no bedtime/wake timestamps. So
 * there is no honest way to report "your bedtime has drifted 40 minutes
 * later this week" — that feature would need sleep-session start times
 * this app doesn't ingest from any provider today. Sleep consistency
 * coaching is therefore not built here rather than approximated from
 * data that can't support it. See docs/SLEEP_COACH.md.
 *
 * What IS real: the recommended-sleep target (CDC/National Sleep
 * Foundation's 7-9 hour range for adults, already cited in
 * wellness.ts), the user's first commitment tomorrow from their
 * connected calendar, their measured sleep quality, and their bedroom
 * temperature from HomeKit where available.
 */

/** Midpoint of the CDC/NSF recommended 7-9 hour adult range — the same
 * anchor `computeSleepScore` uses. */
const TARGET_SLEEP_MINUTES = 8 * 60;
/** Time between "start winding down" and "asleep" that the bedtime
 * target budgets for. MoodSync's own allowance, not a research figure. */
const WIND_DOWN_MINUTES = 30;
/** How long before the first commitment the user needs to be up and
 * ready. MoodSync's own allowance. */
const MORNING_BUFFER_MINUTES = 60;

export interface BedtimeTarget {
  /** When to be asleep by, to get the full target on this schedule. */
  asleepBy: Date;
  /** When to start winding down — the actionable one. */
  windDownAt: Date;
  /** What drove the target: the first commitment tomorrow, or a plain
   * "target sleep before a typical morning" when no calendar is
   * connected. The UI always shows this. */
  reason: string;
  /** True when a real calendar commitment anchored the calculation
   * rather than a generic assumption — lets the UI be honest about
   * which kind of answer this is. */
  anchoredToCalendar: boolean;
}

/**
 * Works backwards from the user's first real commitment tomorrow. With
 * no calendar connected, returns `null` rather than inventing a wake
 * time — a bedtime target built on a guessed morning is worse than no
 * bedtime target.
 */
export function computeBedtimeTarget(firstCommitmentTomorrow: Date | null, now: Date = new Date()): BedtimeTarget | null {
  if (!firstCommitmentTomorrow) return null;

  const wakeBy = new Date(firstCommitmentTomorrow.getTime() - MORNING_BUFFER_MINUTES * 60_000);
  const asleepBy = new Date(wakeBy.getTime() - TARGET_SLEEP_MINUTES * 60_000);
  const windDownAt = new Date(asleepBy.getTime() - WIND_DOWN_MINUTES * 60_000);
  if (windDownAt <= now) {
    // The target has already passed for tonight — still honest to show
    // it, the UI phrases this as "you're already past it."
  }

  const commitmentTime = firstCommitmentTomorrow.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return {
    asleepBy,
    windDownAt,
    reason: `Your first commitment tomorrow is at ${commitmentTime}, and 8 hours of sleep plus an hour to get ready works back to this.`,
    anchoredToCalendar: true,
  };
}

export type WindDownStepKind = 'temperature' | 'light' | 'breathing' | 'screens' | 'scene';

export interface WindDownStep {
  kind: WindDownStepKind;
  label: string;
  reason: string;
}

export interface WindDownInput {
  /** Bedroom temperature in °C from the HomeKit snapshot, and the
   * user's own configured sleep range. Both null when there's no
   * HomeKit sensor or no configured range — the temperature step is
   * simply omitted then, not guessed. */
  bedroomTemperatureC: number | null;
  sleepRangeC: { min: number; max: number } | null;
  /** Latest computed stress score, to decide whether a breathing step
   * is worth suggesting. */
  stressScore: number | null;
  /** Name of a HomeKit scene whose name suggests it's a sleep scene, if
   * one exists in the user's real home. Never invented — the caller
   * matches against the actual scene list. */
  sleepSceneName: string | null;
}

const HIGH_STRESS_THRESHOLD = 60;

/**
 * Builds a wind-down routine from signals that actually exist for this
 * user. Every step names its own reason; steps whose backing signal is
 * missing are omitted rather than filled with generic sleep-hygiene
 * advice, which is the whole difference between this and a listicle.
 */
export function buildWindDownRoutine(input: WindDownInput): WindDownStep[] {
  const steps: WindDownStep[] = [];

  if (input.bedroomTemperatureC !== null && input.sleepRangeC) {
    if (input.bedroomTemperatureC > input.sleepRangeC.max) {
      steps.push({
        kind: 'temperature',
        label: `Cool the bedroom toward ${input.sleepRangeC.max}°C`,
        reason: `It's ${Math.round(input.bedroomTemperatureC)}°C in there — above the range you sleep best in.`,
      });
    } else if (input.bedroomTemperatureC < input.sleepRangeC.min) {
      steps.push({
        kind: 'temperature',
        label: `Warm the bedroom toward ${input.sleepRangeC.min}°C`,
        reason: `It's ${Math.round(input.bedroomTemperatureC)}°C in there — below the range you sleep best in.`,
      });
    }
  }

  if (input.stressScore !== null && input.stressScore >= HIGH_STRESS_THRESHOLD) {
    steps.push({
      kind: 'breathing',
      label: 'Five minutes of slow breathing',
      reason: 'Your stress reading is elevated this evening.',
    });
  }

  if (input.sleepSceneName) {
    steps.push({
      kind: 'scene',
      label: `Run your "${input.sleepSceneName}" scene`,
      reason: 'You already have a scene set up for this.',
    });
  } else {
    steps.push({
      kind: 'light',
      label: 'Dim the lights an hour before bed',
      reason: 'Lower light in the last hour supports the natural drop-off into sleep.',
    });
  }

  steps.push({
    kind: 'screens',
    label: 'Put screens down 30 minutes out',
    reason: 'The last half hour is the part that most reliably affects how fast you fall asleep.',
  });

  return steps;
}

export interface SleepQualitySummary {
  /** Mean sleep score across the window, or null when nothing was
   * measured. */
  averageScore: number | null;
  /** Mean total sleep in minutes, only when stage data exists (WHOOP /
   * Google Health) — null for providers that report a score with no
   * stage breakdown. */
  averageTotalMinutes: number | null;
  /** Nights measured in the window — the UI shows this so an average
   * over two nights isn't read as a trend. */
  nightsMeasured: number;
  /** Difference between the most recent night and the window average,
   * in score points. Null when there's nothing to compare against. */
  lastNightVsAverage: number | null;
}

export interface SleepNight {
  sleepScore: number | null;
  deepSleepMinutes: number | null;
  remSleepMinutes: number | null;
  lightSleepMinutes: number | null;
}

/** Newest-first `nights`, matching how the biometric repository returns
 * recent readings. */
export function summarizeSleepQuality(nights: SleepNight[]): SleepQualitySummary {
  const scores = nights.map((n) => n.sleepScore).filter((v): v is number => v !== null);
  const totals = nights
    .map((n) =>
      n.deepSleepMinutes !== null && n.remSleepMinutes !== null && n.lightSleepMinutes !== null
        ? n.deepSleepMinutes + n.remSleepMinutes + n.lightSleepMinutes
        : null,
    )
    .filter((v): v is number => v !== null);

  const averageScore = scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null;
  const averageTotalMinutes = totals.length > 0 ? Math.round(totals.reduce((s, v) => s + v, 0) / totals.length) : null;

  const lastNight = scores[0];
  const priorScores = scores.slice(1);
  const lastNightVsAverage =
    lastNight !== undefined && priorScores.length > 0
      ? Math.round(lastNight - priorScores.reduce((s, v) => s + v, 0) / priorScores.length)
      : null;

  return { averageScore, averageTotalMinutes, nightsMeasured: scores.length, lastNightVsAverage };
}
