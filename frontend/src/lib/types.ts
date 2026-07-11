import type { AutomationRuleDefinition } from "@moodsync/shared";

export type ConnectionStatus = "ACTIVE" | "EXPIRED" | "REVOKED" | "ERROR" | "NOT_YET_AVAILABLE";

export interface WearableConnectionSummary {
  id: string;
  provider: "WHOOP" | "GOOGLE_HEALTH" | "GARMIN";
  status: ConnectionStatus;
  lastSyncedAt: string | null;
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
  provider: "HUE" | "SPOTIFY" | "ECOBEE";
  status: ConnectionStatus;
  lastSyncedAt: string | null;
  devices: DeviceSummary[];
}

export interface ConnectionsResponse {
  wearables: WearableConnectionSummary[];
  smartHome: SmartHomeConnectionSummary[];
}

export type AutomationOutcome = "EXECUTED" | "SKIPPED_COOLDOWN" | "SKIPPED_DISABLED" | "FAILED";

export interface AutomationHistoryEntry {
  id: string;
  ruleId: string;
  rule: { name: string };
  triggerReadingId: string | null;
  outcome: AutomationOutcome;
  failureReason: string | null;
  executedAt: string;
}

export type { AutomationRuleDefinition };
