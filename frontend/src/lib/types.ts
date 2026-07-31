import type { AutomationRuleDefinition } from "@moodsync/shared";

export type { TimeWindow } from "@moodsync/shared";

export type ConnectionStatus = "ACTIVE" | "EXPIRED" | "REVOKED" | "ERROR" | "NOT_YET_AVAILABLE";

export interface WearableConnectionSummary {
  id: string;
  provider: "WHOOP" | "GOOGLE_HEALTH" | "GARMIN" | "APPLE_HEALTH" | "AMAZFIT";
  status: ConnectionStatus;
  lastSyncedAt: string | null;
  /** Only populated for providers whose API exposes it — confirmed
   * present for Fitbit (Google Health's `pairedDevices` resource),
   * confirmed absent from WHOOP's public API. Always null otherwise,
   * not a loading/unknown state. */
  deviceName: string | null;
  batteryLevel: number | null;
  batteryStatus: string | null;
}

export interface DeviceSummary {
  id: string;
  externalDeviceId: string;
  name: string;
  deviceType: string;
  room: string | null;
  isOnline: boolean;
}

export interface SmartHomeConnectionSummary {
  id: string;
  provider: "HUE" | "SPOTIFY" | "ECOBEE" | "ALEXA";
  status: ConnectionStatus;
  lastSyncedAt: string | null;
  devices: DeviceSummary[];
}

/** Not a SmartHomeConnectionSummary — Apple Music has no OAuth client
 * secret/redirect flow and no fixed token expiry, so it doesn't fit that
 * shape server-side either (see AppleMusicConnection's schema doc
 * comment). `null` means no connection exists yet; it does NOT
 * distinguish "server isn't configured for Apple Music at all" from
 * "user hasn't authorized" — that distinction only surfaces when
 * actually trying to fetch a developer token (a 503 means the former).
 */
export interface AppleMusicConnectionSummary {
  id: string;
  status: ConnectionStatus;
  storefront: string | null;
  lastSyncedAt: string | null;
}

/** Not a SmartHomeConnectionSummary either — same "own domain, own row
 * shape" rationale as AppleMusicConnectionSummary, but this one *does*
 * use the standard OAuth connect/callback/disconnect flow (see
 * CalendarConnection's schema doc comment), it just has no `devices`
 * concept. */
export interface CalendarConnectionSummary {
  id: string;
  status: ConnectionStatus;
  lastSyncedAt: string | null;
}

export interface ConnectionsResponse {
  wearables: WearableConnectionSummary[];
  smartHome: SmartHomeConnectionSummary[];
  appleMusic: AppleMusicConnectionSummary | null;
  calendar: CalendarConnectionSummary | null;
}

export type AutomationOutcome =
  | "EXECUTED"
  | "SKIPPED_COOLDOWN"
  | "SKIPPED_DISABLED"
  | "SKIPPED_CONFLICT"
  | "SKIPPED_MANUAL_PAUSE"
  | "SKIPPED_SAFETY_RATE_LIMIT"
  | "QUEUED_FOR_DEVICE"
  | "FAILED";

export interface AutomationHistoryEntry {
  id: string;
  ruleId: string;
  rule: { name: string };
  triggerReadingId: string | null;
  outcome: AutomationOutcome;
  failureReason: string | null;
  reason: string | null;
  executedAt: string;
}

export interface NotificationEntry {
  id: string;
  title: string;
  body: string;
  ruleId: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationPreferences {
  notificationsEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  notificationDigestMode: "IMMEDIATE" | "HOURLY";
}

export type ScoreBasis = "provider-native" | "evidence-informed-heuristic" | "heuristic";

export interface WellnessScore {
  value: number | null;
  basis: ScoreBasis;
}

export interface WellnessScores {
  stress: WellnessScore;
  recovery: WellnessScore;
  sleep: WellnessScore;
  energy: WellnessScore;
  fatigue: WellnessScore;
  focus: WellnessScore;
  relaxation: WellnessScore;
  overall: WellnessScore;
}

/** Payloads for the companion surfaces — everything under
 * `backend/src/api/routes/companion.ts`. Kept together so the shapes the
 * Today/Energy/Sleep/Recovery pages consume are visible in one place. */

export type CompanionTimeOfDay = "morning" | "afternoon" | "evening" | "night";

export interface OvernightChange {
  metric: "sleep" | "recovery";
  delta: number;
  sentence: string;
}

export interface BriefAction {
  kind: string;
  label: string;
  reason: string;
  href: string;
}

export interface DailyBriefResponse {
  greeting: string;
  timeOfDay: CompanionTimeOfDay;
  /** False when no wearable has ever synced — the UI shows a connect
   * prompt rather than a page of dashes. */
  hasData: boolean;
  readiness: WellnessScore;
  energy: number | null;
  scores?: WellnessScores;
  overnightChanges: OvernightChange[];
  burnout?: { title: string; body: string } | null;
  bookedHoursToday?: number | null;
  eventCountToday?: number | null;
  brief: { focusToday: string; avoidToday: string | null; actions: BriefAction[] } | null;
}

export type SocialBatteryLevel = "high" | "medium" | "low";

export interface SocialBatteryResponse {
  battery: { level: SocialBatteryLevel; value: number; reasons: string[]; disclaimer: string } | null;
  guidance: string | null;
}

export interface StressTimelineEntry {
  at: string;
  direction: "spike" | "drop";
  magnitudeZ: number;
  heartRate: number;
  context: string | null;
}

export interface StressTimelineResponse {
  timeline: StressTimelineEntry[];
  calendarConnected: boolean;
}

export interface WindDownStep {
  kind: "temperature" | "light" | "breathing" | "screens" | "scene";
  label: string;
  reason: string;
}

export interface SleepCoachResponse {
  bedtimeTarget: { asleepBy: string; windDownAt: string; reason: string; anchoredToCalendar: boolean } | null;
  windDown: WindDownStep[];
  quality: {
    averageScore: number | null;
    averageTotalMinutes: number | null;
    nightsMeasured: number;
    lastNightVsAverage: number | null;
  };
  bedroomTemperatureC: number | null;
}

export interface MemoryFinding {
  label: string;
  meanDelta: number;
  sampleSize: number;
  sentence: string;
}

export interface WellnessMemoryResponse {
  findings: MemoryFinding[];
  bestFocusHours: Array<{ hourOfDay: number; meanScore: number; sampleSize: number }>;
  windowDays: number;
  historyDays: number;
}

export interface BreakSuggestionResponse {
  suggestion: { kind: "walk" | "stretch" | "water" | "breathing"; label: string; reason: string } | null;
}

/** Music + biometrics feedback loop — see docs/MUSIC_FEEDBACK_LOOP.md. */

export type MusicMode = "FOCUS" | "RELAX" | "SLEEP" | "RECOVERY" | "MORNING" | "WORKOUT";
export type MusicProviderKind = "APPLE_MUSIC" | "SPOTIFY" | "OTHER";
/** `measured` = a real before/after comparison. `interpretation` =
 * MoodSync joined the dots. `insufficient` = not enough data, and no
 * conclusion is drawn. */
export type MusicOutcomeConfidence = "measured" | "interpretation" | "insufficient";

export interface MusicSessionEntry {
  id: string;
  mode: MusicMode;
  provider: MusicProviderKind;
  itemName: string;
  itemKind: string;
  itemExternalId: string | null;
  genre: string | null;
  startedAt: string;
  endedAt: string | null;
  /** Snapshotted when the session opened — what the player's
   * before/after panel compares "now" against. */
  baselineHeartRate: number | null;
  baselineStressScore: number | null;
  baselineRecoveryScore: number | null;
  outcomeHeartRateDelta: number | null;
  outcomeStressDelta: number | null;
  outcomeConfidence: MusicOutcomeConfidence | null;
  outcomeSummary: string | null;
  endedEarly: boolean;
}

export interface MusicExplanation {
  itemName: string;
  mode: MusicMode;
  metric: string | null;
  comparedWindows: string | null;
  confidence: MusicOutcomeConfidence;
  caveat: string;
}

export interface MusicOutcome {
  confidence: MusicOutcomeConfidence;
  summary: string;
  heartRateDelta: number | null;
  explanation: MusicExplanation;
}

export interface MusicRecommendationEntry {
  text: string;
  mode: MusicMode;
  sessions: number;
}

/** Supportive-language description of where a session is heading.
 * Generated by ai/src/moodLanguage.ts — `progress` is null whenever
 * nothing measurable has moved, and the ring renders empty rather than
 * showing a flattering arc. */
export interface ActiveState {
  label: string;
  detail: string;
  progress: number | null;
}

/** One round trip for the player's emotional panel: the open session
 * (carrying its stored baseline), the current scores, and the derived
 * state — all describing the same instant. */
export interface MusicLiveStateResponse {
  session: MusicSessionEntry | null;
  current: { stress: number | null; focus: number | null; heartRate: number | null };
  heartRateDelta?: number | null;
  elapsedMinutes?: number | null;
  activeState: ActiveState | null;
  journeyLabel?: string;
}

export interface MusicSessionSummaryResponse {
  session: MusicSessionEntry;
  /** The next-morning follow-up, for sleep/recovery sessions only. */
  nextNight: MusicOutcome | null;
  nextTime: MusicRecommendationEntry | null;
}

export interface MusicEffectivenessEntry {
  label: string;
  mode: MusicMode;
  sessions: number;
  meanHeartRateDelta: number;
  helped: boolean;
  earlyStopRate: number;
}

export interface MusicAnalyticsResponse {
  windowDays: number;
  totalSessions: number;
  playlists: MusicEffectivenessEntry[];
  genres: MusicEffectivenessEntry[];
  bestHours: Array<{
    mode: MusicMode;
    label: string;
    hours: Array<{ mode: MusicMode; hourOfDay: number; sessions: number; meanHeartRateDelta: number }>;
  }>;
  recommendations: MusicRecommendationEntry[];
  focusDuration:
    | {
        label: string;
        withMusicMinutes: number;
        withoutMusicMinutes: number;
        differenceMinutes: number;
        sessionsWithMusic: number;
        sessionsWithoutMusic: number;
        sentence: string | null;
      }
    | null;
}

export type { AutomationRuleDefinition };

export interface TrendResult {
  metric: string;
  current: number;
  previous: number;
  delta: number;
  direction: "up" | "down" | "flat";
}

export interface AutomationEffectivenessResult {
  ruleId: string;
  ruleName: string;
  metric: string;
  executedCount: number;
  comparableCount: number;
  improvedCount: number;
  effectivenessRate: number | null;
}

export interface SceneUsageResult {
  sceneId: string;
  sceneName: string;
  runCount: number;
  lastRunAt: string | null;
}

export interface InsightsResponse {
  trends: TrendResult[];
  wellnessTrends: TrendResult[];
  automationEffectiveness: AutomationEffectivenessResult[];
  sceneUsage: SceneUsageResult[];
}

export interface WellnessResponse {
  scores: WellnessScores | null;
}

export interface RecommendationEntry {
  id: string;
  title: string;
  description: string;
  status: "PENDING" | "ACCEPTED" | "DISMISSED" | "EXPIRED";
  suggestedActions:
    | { kind: "template"; templateId: string }
    | { kind: "edit-rule"; ruleId: string }
    | { kind: "run-scene"; sceneId: string; sceneName: string }
    | { templateId: string };
  createdAt: string;
  respondedAt: string | null;
}

export interface PersistedInsight {
  id: string;
  period: "DAILY" | "WEEKLY";
  metric: string;
  periodStart: string;
  periodEnd: string;
  value: number;
  trend: number | null;
  summary: string | null;
  createdAt: string;
}

export type MeditationAmbience = "rain" | "forest" | "ocean" | "noise";

export interface FocusSessionEntry {
  id: string;
  userId: string;
  durationMinutes: number;
  startedAt: string;
  completedAt: string;
  /** Null when too few heart rate samples existed during the session to
   * compute one — see FocusSession's schema comment. */
  focusScore: number | null;
}

export interface MeditationSessionEntry {
  id: string;
  userId: string;
  durationMinutes: number;
  ambience: MeditationAmbience | null;
  startedAt: string;
  completedAt: string;
}

/** Cached Apple Home state — pushed by the iOS companion app
 * (HomeKitController.fetchHomeSnapshot()), since the backend can never
 * query HomeKit directly. See docs/HOME_SCENES_ARCHITECTURE.md. */
export type HomeAccessoryCategory =
  | "LOCK"
  | "GARAGE_DOOR"
  | "ALARM_SYSTEM"
  | "SMOKE_DETECTOR"
  | "LEAK_SENSOR"
  | "WINDOW_COVERING"
  | "DOORBELL"
  | "OUTLET_OR_SWITCH"
  | "LIGHT"
  | "THERMOSTAT_OR_SENSOR"
  | "OTHER";

export interface HomeRoomEntry {
  id: string;
  roomId: string;
  name: string;
  temperatureC: number | null;
  humidityPct: number | null;
  airQuality: string | null;
}

export interface HomeAccessoryEntry {
  id: string;
  accessoryId: string;
  name: string;
  roomId: string | null;
  category: HomeAccessoryCategory;
  manufacturer: string | null;
  model: string | null;
  firmwareVersion: string | null;
  reachable: boolean;
  batteryLevelPct: number | null;
  statusValue: string | null;
  isSecurityAccessory: boolean;
}

export interface HomeSceneEntry {
  id: string;
  sceneId: string;
  name: string;
  accessoryIds: string[];
  isFavorite: boolean;
  lastRunAt: string | null;
  runCount: number;
}

export interface HomeSnapshotEntry {
  id: string;
  homeId: string;
  homeName: string;
  isMatterHome: boolean;
  pushedAt: string;
  rooms: HomeRoomEntry[];
  zones: { id: string; zoneId: string; name: string; roomIds: string[] }[];
  accessories: HomeAccessoryEntry[];
  scenes: HomeSceneEntry[];
}

/** Home Wellness (Environment) Score — see ai/src/homeWellness.ts.
 * Noise/Lighting/Diffuser deliberately excluded, no sensor exists. */
export interface HomeScoreEntry {
  value: number | null;
  basis: "evidence-informed-heuristic" | "heuristic";
}

export interface RoomWellnessEntry {
  roomId: string;
  name: string;
  temperatureScore: HomeScoreEntry;
  humidityScore: HomeScoreEntry;
  airQualityScore: HomeScoreEntry;
  overallScore: HomeScoreEntry;
}

export interface HomeSnapshotResponse {
  snapshot: HomeSnapshotEntry | null;
  roomWellness: RoomWellnessEntry[];
  overallWellness: HomeScoreEntry;
}

/** Habit Engine — scoped to the two habits with a real signal (steps,
 * MeditationSession). See docs/HABIT_ENGINE.md. */
export interface HabitStreakEntry {
  habit: "walking" | "meditation" | "focus";
  currentStreakDays: number;
  consistencyPct: number | null;
  lastMetDate: string | null;
}

export interface HabitsResponse {
  habits: HabitStreakEntry[];
}
