export type SocialBatteryLevel = 'high' | 'medium' | 'low';

export interface SocialBatteryInput {
  sleepScore: number | null;
  /** Own-baseline z-score of HRV — Apple Health-only today (see
   * NormalizedBiometricReading.heartRateVariability), null for every
   * other provider, which is why it's one contributor among several
   * rather than a requirement. */
  hrvZ: number | null;
  recoveryScore: number | null;
  /** Hours of calendar time booked today — null when no calendar is
   * connected, distinct from 0 (a connected calendar with a free day). */
  bookedHoursToday: number | null;
}

export interface SocialBatteryResult {
  level: SocialBatteryLevel;
  /** 0-100 behind the level, so the UI can render a meter as well as a
   * word. Never presented as a measurement — see `disclaimer`. */
  value: number;
  /** Plain-language reasons, most significant first — this app never
   * shows a score without showing what drove it. */
  reasons: string[];
  /** The user's own explicit requirement for this feature: it must be
   * clearly labeled as an AI estimate, not a medical measurement.
   * Shipped as part of the payload rather than left to each UI surface
   * to remember, so the label can't be dropped by a caller. */
  disclaimer: string;
}

const DISCLAIMER = 'An AI estimate based on your recent sleep, recovery, and schedule — not a medical measurement.';

/** Hours of booked calendar time past which the day itself is treated as
 * a meaningful drain. MoodSync's own threshold, not a research finding. */
const HEAVY_SCHEDULE_HOURS = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Social Battery / cognitive load — a **heuristic AI estimate** of how
 * much social and mental capacity the user likely has right now. No
 * clinical instrument measures this from wearable data; this blends the
 * signals that plausibly relate to it (sleep quality, recovery, HRV
 * relative to the user's own baseline, and how booked the day is) into
 * one number, and always ships the reasons and the disclaimer alongside.
 *
 * Returns `null` when neither sleep nor recovery is available — with no
 * physiological signal at all, a calendar alone can't say anything about
 * social capacity, and this app doesn't guess.
 */
export function computeSocialBattery(input: SocialBatteryInput): SocialBatteryResult | null {
  if (input.sleepScore === null && input.recoveryScore === null) return null;

  const weighted: Array<{ value: number; weight: number }> = [];
  const reasons: string[] = [];

  if (input.recoveryScore !== null) {
    weighted.push({ value: input.recoveryScore, weight: 0.4 });
    if (input.recoveryScore < 40) reasons.push('your recovery is low today');
    else if (input.recoveryScore >= 70) reasons.push('your recovery is strong today');
  }

  if (input.sleepScore !== null) {
    weighted.push({ value: input.sleepScore, weight: 0.35 });
    if (input.sleepScore < 50) reasons.push('you slept poorly');
    else if (input.sleepScore >= 75) reasons.push('you slept well');
  }

  if (input.hrvZ !== null) {
    // z of -2..+2 maps onto 0..100, same curve wellness.ts uses.
    weighted.push({ value: clamp(50 + input.hrvZ * 25, 0, 100), weight: 0.15 });
    if (input.hrvZ <= -1) reasons.push('your HRV is below your usual baseline');
  }

  if (input.bookedHoursToday !== null) {
    const scheduleValue = clamp(100 - (input.bookedHoursToday / HEAVY_SCHEDULE_HOURS) * 100, 0, 100);
    weighted.push({ value: scheduleValue, weight: 0.1 });
    if (input.bookedHoursToday >= HEAVY_SCHEDULE_HOURS) {
      reasons.push(`you have ${Math.round(input.bookedHoursToday)} hours booked today`);
    }
  }

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  const value = Math.round(weighted.reduce((sum, w) => sum + w.value * w.weight, 0) / totalWeight);

  const level: SocialBatteryLevel = value >= 67 ? 'high' : value >= 34 ? 'medium' : 'low';
  if (reasons.length === 0) {
    reasons.push('your recent numbers are close to your own average');
  }

  return { level, value, reasons, disclaimer: DISCLAIMER };
}

/** The one-line guidance shown under the meter. Deliberately suggests
 * rather than instructs, and never claims to know the user's plans. */
export function socialBatteryGuidance(level: SocialBatteryLevel): string {
  switch (level) {
    case 'high':
      return 'A good day for people, plans, and anything that takes presence.';
    case 'medium':
      return 'Enough for what matters — you may want to keep the day from overfilling.';
    case 'low':
      return 'You may benefit from a quiet evening and fewer commitments.';
  }
}
