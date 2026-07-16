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

export interface ConnectionsResponse {
  wearables: WearableConnectionSummary[];
  smartHome: SmartHomeConnectionSummary[];
}

export type AutomationOutcome =
  | "EXECUTED"
  | "SKIPPED_COOLDOWN"
  | "SKIPPED_DISABLED"
  | "SKIPPED_CONFLICT"
  | "SKIPPED_MANUAL_PAUSE"
  | "SKIPPED_SAFETY_RATE_LIMIT"
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

export interface InsightsResponse {
  trends: TrendResult[];
  wellnessTrends: TrendResult[];
  automationEffectiveness: AutomationEffectivenessResult[];
}

export interface WellnessResponse {
  scores: WellnessScores | null;
}
