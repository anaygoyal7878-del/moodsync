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

export interface ConnectionsResponse {
  wearables: WearableConnectionSummary[];
  smartHome: SmartHomeConnectionSummary[];
  appleMusic: AppleMusicConnectionSummary | null;
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

export interface HomeSnapshotResponse {
  snapshot: HomeSnapshotEntry | null;
}
