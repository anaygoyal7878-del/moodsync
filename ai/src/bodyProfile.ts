/**
 * What a person's body measurements let MoodSync work out — and, as
 * carefully, what they do not.
 *
 * Three derivations, each only as strong as its source:
 *
 * - **Age**, from birth date. Used to pick the right published sleep band
 *   and to estimate maximum heart rate.
 * - **Estimated maximum heart rate**, via Tanaka, Monahan & Seals (2001):
 *   208 − 0.7 × age. Chosen over the familiar 220 − age because the
 *   latter was fitted to roughly a dozen early studies and systematically
 *   overestimates older adults and underestimates younger ones; Tanaka's
 *   is a meta-analysis of 351 studies and 18,712 people.
 * - **BMI**, from height and weight, with CDC's adult categories.
 *
 * ## The honesty constraints
 *
 * **Any age formula is a population average.** Individuals scatter
 * roughly ±10–12 bpm around it. So zones are labelled as estimates and
 * carry that range, and they defer to a measured maximum whenever one is
 * supplied — a real peak from a hard effort beats any regression.
 *
 * **Adult BMI categories do not apply under 20.** CDC interprets BMI for
 * ages 2–19 against age-and-sex growth percentiles, and MoodSync does not
 * collect sex. Returning an adult category for a 16-year-old would be
 * confidently wrong, so under 20 the number is returned and the category
 * is null, with the reason.
 *
 * **BMI is a screening measure, not a diagnosis.** It does not
 * distinguish fat from muscle or bone, or where fat is carried. It is
 * reported as what it is.
 */

export const MIN_ADULT_BMI_AGE = 20;

/** Plausible human bounds. Values outside these are treated as entry
 * errors (a height typed in inches into a centimetre field) rather than
 * computed into a confident, absurd result. */
const BOUNDS = {
  ageYears: { min: 5, max: 110 },
  heightCm: { min: 90, max: 250 },
  weightKg: { min: 20, max: 350 },
};

/** Whole years between a birth date and `now`, accounting for whether
 * the birthday has happened yet this year. Null for an implausible or
 * future date. */
export function ageFrom(birthDate: Date, now: Date = new Date()): number | null {
  if (Number.isNaN(birthDate.getTime()) || birthDate > now) return null;
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= BOUNDS.ageYears.min && age <= BOUNDS.ageYears.max ? age : null;
}

export interface MaxHeartRateEstimate {
  bpm: number;
  /** 'measured' when a real observed peak was supplied; otherwise the
   * Tanaka estimate. Surfaced so the UI never presents a regression as a
   * measurement. */
  basis: 'measured' | 'tanaka-2001';
  /** Plausible individual range around an estimate. Null when measured. */
  range: { low: number; high: number } | null;
}

/**
 * Estimated maximum heart rate.
 *
 * `observedPeak` is the highest heart rate the person's own device has
 * recorded. When it exceeds the formula, the formula is demonstrably too
 * low for them and the observation wins — the formula is a prior, their
 * data is evidence.
 */
export function estimateMaxHeartRate(age: number, observedPeak: number | null = null): MaxHeartRateEstimate {
  const tanaka = Math.round(208 - 0.7 * age);
  if (observedPeak !== null && observedPeak > tanaka) {
    return { bpm: Math.round(observedPeak), basis: 'measured', range: null };
  }
  return { bpm: tanaka, basis: 'tanaka-2001', range: { low: tanaka - 11, high: tanaka + 11 } };
}

export interface HeartRateZone {
  zone: 1 | 2 | 3 | 4 | 5;
  label: string;
  /** Fraction of max heart rate at the bottom and top of the zone. */
  minPct: number;
  maxPct: number;
  minBpm: number;
  maxBpm: number;
  /** What effort in this zone generally feels like. */
  feel: string;
}

/**
 * The common five-zone model as percentages of maximum heart rate.
 *
 * The 50/60/70/80/90% boundaries are a widely used training convention
 * rather than a physiological constant, and they are labelled here as
 * such. Zones are only as good as the maximum they are computed from.
 */
const ZONE_DEFINITION: Array<Omit<HeartRateZone, 'minBpm' | 'maxBpm'>> = [
  { zone: 1, label: 'Very light', minPct: 0.5, maxPct: 0.6, feel: 'Easy, conversational — warm-up and recovery' },
  { zone: 2, label: 'Light', minPct: 0.6, maxPct: 0.7, feel: 'Comfortable and sustainable for a long time' },
  { zone: 3, label: 'Moderate', minPct: 0.7, maxPct: 0.8, feel: 'Breathing harder; talking in short sentences' },
  { zone: 4, label: 'Hard', minPct: 0.8, maxPct: 0.9, feel: 'Difficult to sustain; a few words at a time' },
  { zone: 5, label: 'Maximum', minPct: 0.9, maxPct: 1.0, feel: 'All-out, only for short bursts' },
];

export function heartRateZones(maxHr: number): HeartRateZone[] {
  return ZONE_DEFINITION.map((z) => ({
    ...z,
    minBpm: Math.round(maxHr * z.minPct),
    maxBpm: Math.round(maxHr * z.maxPct),
  }));
}

/** Which zone a heart rate falls in, or null below zone 1 (resting). */
export function zoneFor(heartRate: number, zones: HeartRateZone[]): HeartRateZone | null {
  for (let i = zones.length - 1; i >= 0; i--) {
    if (heartRate >= zones[i]!.minBpm) return zones[i]!;
  }
  return null;
}

export type BmiCategory = 'underweight' | 'healthy' | 'overweight' | 'obesity';

export interface BmiResult {
  value: number;
  /** Null under 20 — adult categories do not apply. */
  category: BmiCategory | null;
  /** Why the category is what it is, or why there isn't one. */
  note: string;
}

/**
 * Body mass index, with CDC adult categories where they apply.
 *
 * Returns null for implausible inputs rather than computing a BMI of 180
 * from a height typed in inches.
 */
export function bmiFor(heightCm: number, weightKg: number, age: number | null): BmiResult | null {
  if (heightCm < BOUNDS.heightCm.min || heightCm > BOUNDS.heightCm.max) return null;
  if (weightKg < BOUNDS.weightKg.min || weightKg > BOUNDS.weightKg.max) return null;

  const meters = heightCm / 100;
  const value = Math.round((weightKg / (meters * meters)) * 10) / 10;

  if (age !== null && age < MIN_ADULT_BMI_AGE) {
    return {
      value,
      category: null,
      note: 'Adult BMI categories don’t apply under 20. CDC reads BMI for teens against age-and-sex growth percentiles, which MoodSync doesn’t calculate.',
    };
  }

  const category: BmiCategory = value < 18.5 ? 'underweight' : value < 25 ? 'healthy' : value < 30 ? 'overweight' : 'obesity';
  return {
    value,
    category,
    note: 'A screening measure, not a diagnosis. BMI doesn’t distinguish muscle from fat, so it reads high for muscular builds.',
  };
}

export interface WeightTrend {
  latestKg: number;
  /** Signed change across the window. Null with fewer than two entries. */
  changeKg: number | null;
  /** Days spanned by the entries the change was computed from. */
  spanDays: number;
}

/**
 * How weight is moving. Needs two entries at least a week apart before
 * reporting a change: day-to-day weight swings a kilo or more with water
 * and food, and a "change" across two days is mostly that noise.
 */
export function weightTrend(entries: Array<{ weightKg: number; recordedAt: Date }>): WeightTrend | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const latest = sorted.at(-1)!;
  const first = sorted[0]!;
  const spanDays = Math.round((latest.recordedAt.getTime() - first.recordedAt.getTime()) / 86_400_000);
  const meaningful = sorted.length >= 2 && spanDays >= 7;
  return {
    latestKg: latest.weightKg,
    changeKg: meaningful ? Math.round((latest.weightKg - first.weightKg) * 10) / 10 : null,
    spanDays,
  };
}

/** Unit conversion at the display edge. */
export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;
