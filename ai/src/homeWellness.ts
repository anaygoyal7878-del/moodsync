/**
 * Home Wellness (Environment) Score — a room-by-room and overall 0-100
 * comfort score computed from `HomeRoomSnapshot`'s real fields
 * (temperature, humidity, air quality) only. Per explicit product scope
 * decision, Noise/Lighting/Diffuser are NOT modeled — no sensor for any
 * of them exists in the current HomeKit snapshot (Diffuser only exists
 * in old, disconnected legacy code) — see docs/HOME_HEALTH_SCORE.md.
 *
 * Same `WellnessScore{value, basis}` shape as ai/src/wellness.ts, for
 * the same reason: `null` when a room has no sensor for a metric
 * (never guessed), and a documented `basis` so the UI can show
 * "evidence-informed" vs "MoodSync's own heuristic."
 */

export type HomeScoreBasis = 'evidence-informed-heuristic' | 'heuristic';

export interface HomeScore {
  value: number | null;
  basis: HomeScoreBasis;
}

export interface RoomWellnessInput {
  roomId: string;
  name: string;
  temperatureC: number | null;
  humidityPct: number | null;
  airQuality: string | null;
}

export interface RoomWellnessResult {
  roomId: string;
  name: string;
  temperatureScore: HomeScore;
  humidityScore: HomeScore;
  airQualityScore: HomeScore;
  /** Average of whichever of the three above are non-null; null if none
   * of the three could be computed (room has no sensors at all). */
  overallScore: HomeScore;
}

/** ASHRAE Standard 55's general thermal-comfort range (20-24°C /
 * 68-75°F) — a real, citable HVAC-industry standard, not a fabricated
 * "ideal temperature." Score falls off linearly outside the range,
 * reaching 0 at ±6°C past either edge (a MoodSync-chosen falloff rate,
 * hence `basis: 'evidence-informed-heuristic'` rather than
 * `'provider-native'` — the range is a real standard, the falloff curve
 * is this app's own scoring choice). */
function scoreTemperature(tempC: number): number {
  const IDEAL_MIN = 20;
  const IDEAL_MAX = 24;
  const FALLOFF_RANGE = 6;
  if (tempC >= IDEAL_MIN && tempC <= IDEAL_MAX) return 100;
  const distance = tempC < IDEAL_MIN ? IDEAL_MIN - tempC : tempC - IDEAL_MAX;
  return Math.round(Math.max(0, 100 - (distance / FALLOFF_RANGE) * 100));
}

/** EPA's recommended indoor relative-humidity range (30-50%) to limit
 * dust mites/mold while avoiding excessive dryness — same
 * real-standard-with-MoodSync's-own-falloff pattern as temperature. */
function scoreHumidity(humidityPct: number): number {
  const IDEAL_MIN = 30;
  const IDEAL_MAX = 50;
  const FALLOFF_RANGE = 25;
  if (humidityPct >= IDEAL_MIN && humidityPct <= IDEAL_MAX) return 100;
  const distance = humidityPct < IDEAL_MIN ? IDEAL_MIN - humidityPct : humidityPct - IDEAL_MAX;
  return Math.round(Math.max(0, 100 - (distance / FALLOFF_RANGE) * 100));
}

/** HomeKit's `HMCharacteristicValueAirQuality` enum is documented as an
 * ordinal 0-5 (unknown/excellent/good/fair/inferior/poor), but this was
 * not independently re-confirmed against a live account this session —
 * the iOS side stores whatever raw value it read as a loose string (see
 * `HomeAccessorySnapshot.airQuality`'s schema comment). This parser only
 * scores a value it can confidently interpret (a bare integer 0-5, or
 * one of the known English names) — anything else returns `null` rather
 * than guessing at an unfamiliar format. */
function scoreAirQuality(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase();
  const byNumber = Number(trimmed);
  if (Number.isInteger(byNumber) && byNumber >= 0 && byNumber <= 5) {
    // 0 = unknown -> no score; 1 (excellent) -> 100 ... 5 (poor) -> 20
    if (byNumber === 0) return null;
    return Math.round(100 - (byNumber - 1) * 20);
  }
  const byName: Record<string, number> = { excellent: 100, good: 80, fair: 60, inferior: 40, poor: 20 };
  return byName[trimmed] ?? null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export function computeHomeWellnessScore(room: RoomWellnessInput): RoomWellnessResult {
  const temperatureScore: HomeScore = {
    value: room.temperatureC === null ? null : scoreTemperature(room.temperatureC),
    basis: 'evidence-informed-heuristic',
  };
  const humidityScore: HomeScore = {
    value: room.humidityPct === null ? null : scoreHumidity(room.humidityPct),
    basis: 'evidence-informed-heuristic',
  };
  const airQualityScore: HomeScore = {
    value: room.airQuality === null ? null : scoreAirQuality(room.airQuality),
    basis: 'heuristic',
  };

  const values = [temperatureScore.value, humidityScore.value, airQualityScore.value].filter(
    (v): v is number => v !== null,
  );

  return {
    roomId: room.roomId,
    name: room.name,
    temperatureScore,
    humidityScore,
    airQualityScore,
    overallScore: { value: average(values), basis: 'evidence-informed-heuristic' },
  };
}

/** Home-wide score — average of each room's `overallScore`, ignoring
 * rooms with no sensor data at all (rather than treating them as 0). */
export function computeOverallHomeWellnessScore(rooms: RoomWellnessInput[]): HomeScore {
  const roomScores = rooms.map(computeHomeWellnessScore).map((r) => r.overallScore.value);
  const values = roomScores.filter((v): v is number => v !== null);
  return { value: average(values), basis: 'evidence-informed-heuristic' };
}
