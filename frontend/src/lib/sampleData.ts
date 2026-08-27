import type { NormalizedBiometricReading } from "@moodsync/shared";
import type { MusicSessionEntry } from "@/lib/types";

/**
 * Sample data for the charts, used ONLY when a surface has no real
 * readings to draw and always rendered behind a visible "Sample data"
 * label (see `SampleBadge`).
 *
 * The rule this file follows: never let invented numbers reach a place
 * a user could read them as their own. A wellness app that shows a
 * flattering fake recovery score is worse than one that shows an empty
 * state — so every consumer of these fixtures must label them, and the
 * moment real data exists it wins.
 *
 * Everything is deterministic (no Math.random): these render inside
 * server components, and a value that differs between the server and
 * client render would be a hydration mismatch.
 */

/** Fixed pseudo-random walk so the sample looks like a real week rather
 * than a sine wave, while staying identical on every render. */
function wobble(seed: number, spread: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * spread;
}

function atDaysAgo(days: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * A week of readings shaped like a real Apple Watch week: three syncs a
 * day (overnight metrics in the morning, activity accumulating through
 * the day), a mid-week dip in recovery, and a strong finish.
 *
 * Newest-first, matching `GET /api/biometrics/history`'s real ordering
 * so consumers can treat it exactly like the live payload.
 */
export function sampleBiometricHistory(): NormalizedBiometricReading[] {
  const readings: NormalizedBiometricReading[] = [];

  for (let day = 6; day >= 0; day--) {
    const i = 6 - day;
    // A dip on days 2-3 of the week, recovering after — gives the charts
    // a story instead of noise.
    const arc = [82, 76, 61, 55, 68, 79, 84][i];
    const steps = Math.round([9400, 11200, 5100, 4300, 8800, 12600, 10300][i] + wobble(i, 600));
    const rhr = Math.round(56 + (82 - arc) * 0.12 + wobble(i + 20, 2));
    const hrv = Math.round(38 + arc * 0.35 + wobble(i + 40, 6));

    const asleepMinutes = Math.round([432, 408, 351, 336, 396, 447, 441][i]);
    const deep = Math.round(asleepMinutes * 0.19 + wobble(i + 60, 10));
    const rem = Math.round(asleepMinutes * 0.23 + wobble(i + 80, 10));

    const base = {
      provider: "apple_health" as const,
      userId: "sample",
    };

    // Morning — overnight metrics land here.
    readings.push({
      ...base,
      timestamp: atDaysAgo(day, 7, 20).toISOString(),
      heartRate: Math.round(rhr + 5 + wobble(i + 100, 4)),
      restingHeartRate: rhr,
      heartRateVariability: hrv,
      respiratoryRate: Math.round((14.6 + wobble(i + 120, 1.4)) * 10) / 10,
      bloodOxygen: Math.round(97 + wobble(i + 140, 1.6)),
      sleepScore: arc,
      recoveryScore: Math.round(arc + wobble(i + 160, 5)),
      stressLevel: Math.round(100 - arc + wobble(i + 180, 8)),
      deepSleepMinutes: deep,
      remSleepMinutes: rem,
      lightSleepMinutes: asleepMinutes - deep - rem,
      steps: Math.round(steps * 0.05),
      calories: Math.round(70 + wobble(i + 200, 30)),
      activityLevel: Math.round(Math.min(100, ((steps * 0.05) / 10000) * 100)),
    });

    // Midday — activity building.
    readings.push({
      ...base,
      timestamp: atDaysAgo(day, 13, 10).toISOString(),
      heartRate: Math.round(78 + wobble(i + 220, 16)),
      steps: Math.round(steps * 0.55),
      calories: Math.round(330 + wobble(i + 240, 110)),
      activityLevel: Math.round(Math.min(100, ((steps * 0.55) / 10000) * 100)),
    });

    // Evening — the day's totals.
    readings.push({
      ...base,
      timestamp: atDaysAgo(day, 20, 35).toISOString(),
      heartRate: Math.round(69 + wobble(i + 260, 10)),
      steps,
      calories: Math.round(520 + wobble(i + 280, 150)),
      activityLevel: Math.round(Math.min(100, (steps / 10000) * 100)),
    });
  }

  return readings.reverse();
}

/** The single newest sample reading — what a `/api/biometrics/latest`
 * response would look like for this fixture. */
export function sampleLatestReading(): NormalizedBiometricReading {
  // The morning reading carries the overnight metrics the rings need,
  // so the sample "today" is that one rather than the literal newest.
  const history = sampleBiometricHistory();
  return history.find((r) => r.sleepScore !== undefined) ?? history[0];
}

interface SampleSessionSpec {
  daysAgo: number;
  hour: number;
  name: string;
  mode: string;
  heartRateDelta: number;
  stressDelta: number | null;
  minutes: number;
}

/** Sessions shaped to tell the truthful version of the story the chart
 * exists to show: calming modes bring heart rate down, a workout drives
 * it up, and one session has no stress reading at all — because a real
 * week has gaps. */
const SAMPLE_SESSION_SPECS: SampleSessionSpec[] = [
  { daysAgo: 6, hour: 9, name: "Deep Focus", mode: "FOCUS", heartRateDelta: -5, stressDelta: -8, minutes: 52 },
  { daysAgo: 5, hour: 21, name: "Evening Ambient", mode: "RELAX", heartRateDelta: -7, stressDelta: -11, minutes: 38 },
  { daysAgo: 4, hour: 17, name: "Uptempo Run", mode: "WORKOUT", heartRateDelta: 9, stressDelta: 3, minutes: 31 },
  { daysAgo: 3, hour: 22, name: "Piano Before Bed", mode: "SLEEP", heartRateDelta: -9, stressDelta: -14, minutes: 44 },
  { daysAgo: 2, hour: 11, name: "Lo-Fi Beats", mode: "FOCUS", heartRateDelta: -3, stressDelta: -5, minutes: 67 },
  { daysAgo: 1, hour: 19, name: "Rainy Day Jazz", mode: "RELAX", heartRateDelta: -6, stressDelta: null, minutes: 41 },
  { daysAgo: 0, hour: 8, name: "Morning Reset", mode: "RECOVERY", heartRateDelta: -4, stressDelta: -7, minutes: 26 },
];

/** Newest-first, matching `GET /api/music-sessions`'s real ordering. */
export function sampleMusicSessions(): MusicSessionEntry[] {
  return SAMPLE_SESSION_SPECS.map((spec, i) => {
    const startedAt = atDaysAgo(spec.daysAgo, spec.hour);
    const endedAt = new Date(startedAt.getTime() + spec.minutes * 60_000);
    const baselineHeartRate = Math.round(72 + wobble(i + 300, 8));

    return {
      id: `sample-${i}`,
      mode: spec.mode,
      provider: "APPLE_MUSIC",
      itemName: spec.name,
      itemKind: "playlist",
      itemExternalId: null,
      genre: null,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      baselineHeartRate,
      baselineStressScore: Math.round(48 + wobble(i + 320, 18)),
      baselineRecoveryScore: Math.round(66 + wobble(i + 340, 16)),
      outcomeHeartRateDelta: spec.heartRateDelta,
      outcomeStressDelta: spec.stressDelta,
      outcomeConfidence: "measured",
      outcomeSummary: null,
      endedEarly: false,
    } as MusicSessionEntry;
  }).reverse();
}

/** Minute-by-minute heart rate through one listening session — the
 * shape the player's in-session trend draws. Starts at the baseline and
 * settles lower, the way a calming session actually reads. */
export function sampleSessionHeartRate(): Array<{ minute: number; bpm: number }> {
  const points: Array<{ minute: number; bpm: number }> = [];
  const baseline = 74;
  for (let minute = 0; minute <= 40; minute += 2) {
    // Exponential settle toward ~62bpm, plus a little real-world noise.
    const settled = 62 + (baseline - 62) * Math.exp(-minute / 14);
    points.push({ minute, bpm: Math.round(settled + wobble(minute + 400, 2.4)) });
  }
  return points;
}
