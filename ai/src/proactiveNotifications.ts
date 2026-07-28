/**
 * Smart (proactive) Notifications — content generated outside the
 * existing rule-fired path (`ai/src/dispatch.ts`/`explain.ts`), which
 * only ever reacts to a matched automation rule. These three producers
 * are the ones with a real, already-available signal to back them —
 * see docs/SMART_NOTIFICATIONS.md for the honest account of what was
 * considered and NOT built (a "you've been sitting for two hours"
 * sedentary alert needs continuous motion/activity tracking this
 * codebase has no source for — steps are a daily rollup, not a
 * per-minute signal — so it's not included here, not faked).
 */

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdev(values: number[], m: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export interface ProactiveNotificationCandidate {
  title: string;
  body: string;
}

/** Same own-baseline z-score technique as ai/src/wellness.ts's
 * `baselineZScore` (re-implemented here rather than imported — that
 * function isn't exported, and this module's threshold/wording is a
 * distinct concern from score computation itself). Needs at least 5
 * historical points, same reasoning as wellness.ts: a z-score off noise
 * isn't a real signal. */
const MIN_HISTORY_FOR_BASELINE = 5;
const UNUSUALLY_HIGH_Z_THRESHOLD = 1.5;

export function checkRecoveryUnusuallyHigh(latestRecovery: number, recentHistory: number[]): ProactiveNotificationCandidate | null {
  if (recentHistory.length < MIN_HISTORY_FOR_BASELINE) return null;
  const m = mean(recentHistory);
  const sd = stdev(recentHistory, m);
  if (sd === 0) return null;
  const z = (latestRecovery - m) / sd;
  if (z < UNUSUALLY_HIGH_Z_THRESHOLD) return null;
  return {
    title: 'Recovery is unusually high today',
    body: `Your computed Recovery score (${Math.round(latestRecovery)}) is well above your recent average — a good day to push a bit harder.`,
  };
}

export interface RoomTemperatureCheckInput {
  roomName: string;
  temperatureC: number;
}

/** Only fires for a room whose name matches the user's configured sleep
 * room (case-insensitive substring match on "bedroom" by default) — no
 * per-room "this is my bedroom" setting exists, so this is a
 * best-effort name match, documented as such rather than assumed
 * reliable. */
export function checkRoomTemperatureOutsideSleepRange(
  rooms: RoomTemperatureCheckInput[],
  sleepRange: { min: number; max: number },
): ProactiveNotificationCandidate | null {
  const bedroom = rooms.find((r) => r.roomName.toLowerCase().includes('bedroom'));
  if (!bedroom) return null;

  if (bedroom.temperatureC > sleepRange.max) {
    return {
      title: `${bedroom.roomName} is warmer than your sleep range`,
      body: `${bedroom.roomName} is at ${Math.round(bedroom.temperatureC)}°C, above your preferred sleep range of ${sleepRange.min}-${sleepRange.max}°C.`,
    };
  }
  if (bedroom.temperatureC < sleepRange.min) {
    return {
      title: `${bedroom.roomName} is cooler than your sleep range`,
      body: `${bedroom.roomName} is at ${Math.round(bedroom.temperatureC)}°C, below your preferred sleep range of ${sleepRange.min}-${sleepRange.max}°C.`,
    };
  }
  return null;
}

export interface BurnoutRiskInput {
  sleepScore: number | null;
  recoveryScore: number | null;
  /** Own-baseline z-score of resting/latest heart rate, same technique
   * as wellness.ts's stress/recovery scoring — null when there isn't
   * enough history to compute one. */
  restingHeartRateZ: number | null;
  /** Count of calendar events today — null when no calendar is
   * connected, distinct from 0 (a connected calendar with a genuinely
   * free day). */
  calendarEventCountToday: number | null;
}

const BURNOUT_POOR_SLEEP_THRESHOLD = 50;
const BURNOUT_LOW_RECOVERY_THRESHOLD = 40;
const BURNOUT_ELEVATED_HR_Z_THRESHOLD = 1;
const BURNOUT_CALENDAR_OVERLOAD_THRESHOLD = 6;

/**
 * Burnout Detection — fires only when poor sleep AND low recovery are
 * both present (the two strongest, most-supported wellness signals in
 * this app) AND at least one secondary signal (elevated heart rate vs.
 * baseline, or a heavily-booked calendar day) also confirms it. This
 * conjunction is deliberately conservative: any single "bad" score
 * (a rough night, one busy day) is normal and shouldn't trigger a
 * burnout warning — this only fires when multiple independent signals
 * agree. **Heuristic** — not a clinical burnout assessment.
 */
export function checkBurnoutRisk(input: BurnoutRiskInput): ProactiveNotificationCandidate | null {
  if (input.sleepScore === null || input.recoveryScore === null) return null;
  if (input.sleepScore >= BURNOUT_POOR_SLEEP_THRESHOLD) return null;
  if (input.recoveryScore >= BURNOUT_LOW_RECOVERY_THRESHOLD) return null;

  const hrElevated = input.restingHeartRateZ !== null && input.restingHeartRateZ >= BURNOUT_ELEVATED_HR_Z_THRESHOLD;
  const calendarOverloaded =
    input.calendarEventCountToday !== null && input.calendarEventCountToday >= BURNOUT_CALENDAR_OVERLOAD_THRESHOLD;
  if (!hrElevated && !calendarOverloaded) return null;

  const reasons: string[] = ['poor sleep', 'low recovery'];
  if (hrElevated) reasons.push('an elevated heart rate');
  if (calendarOverloaded) reasons.push('a heavily-booked calendar');

  return {
    title: "You're showing early signs of burnout",
    body: `${reasons.slice(0, -1).join(', ')} and ${reasons[reasons.length - 1]} today. Consider a 20-minute walk or stretch, hydrating, or ending work a bit early.`,
  };
}

export interface SceneRunEvent {
  sceneName: string;
  /** Hour the scene actually ran, 0-23, in the user's local timezone —
   * caller's responsibility to convert from UTC before passing in. */
  hourOfDay: number;
}

const MIN_RUNS_FOR_PATTERN = 3;
/** How wide a window around the current hour counts as "this time of
 * day" — MoodSync's own bucket width, not a statistical finding. */
const HOUR_WINDOW = 1;

/** Best-effort "you tend to run this scene around now" pattern —
 * counts how many of a scene's past runs happened within `HOUR_WINDOW`
 * hours of `currentHour`, and only surfaces the scene if that's most of
 * its runs (a real majority pattern, not a coincidence of 2 runs both
 * happening to land nearby). */
export function checkSceneTimeOfDayPattern(events: SceneRunEvent[], currentHour: number): ProactiveNotificationCandidate | null {
  const bySceneName = new Map<string, number[]>();
  for (const event of events) {
    const hours = bySceneName.get(event.sceneName) ?? [];
    hours.push(event.hourOfDay);
    bySceneName.set(event.sceneName, hours);
  }

  for (const [sceneName, hours] of bySceneName) {
    if (hours.length < MIN_RUNS_FOR_PATTERN) continue;
    const nearCurrentHour = hours.filter((h) => {
      const diff = Math.min(Math.abs(h - currentHour), 24 - Math.abs(h - currentHour));
      return diff <= HOUR_WINDOW;
    }).length;
    if (nearCurrentHour / hours.length > 0.5) {
      return {
        title: `Your "${sceneName}" scene usually helps at this time of day`,
        body: `You've run "${sceneName}" around this time ${nearCurrentHour} of the last ${hours.length} times — want to run it now?`,
      };
    }
  }
  return null;
}
