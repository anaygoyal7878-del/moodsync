import type { ConnectionStatus } from "@/lib/types";

const STATUS_CONFIG: Record<ConnectionStatus, { label: string; dotClass: string }> = {
  ACTIVE: { label: "Connected", dotClass: "bg-brand" },
  EXPIRED: { label: "Needs reconnect", dotClass: "bg-amber-400" },
  ERROR: { label: "Connection error", dotClass: "bg-red-400" },
  REVOKED: { label: "Disconnected", dotClass: "bg-ink-muted" },
  NOT_YET_AVAILABLE: { label: "Not available", dotClass: "bg-ink-muted" },
};

/** Small colored-dot + label pair shared by every connection card, so
 * WHOOP/Fitbit/Hue/Spotify never drift on what EXPIRED vs ERROR vs
 * REVOKED actually looks like to the user. */
export function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  const { label, dotClass } = STATUS_CONFIG[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
      {label}
    </span>
  );
}

/** EXPIRED (token refresh failed) and ERROR (a sync call failed) both
 * need the user to go through the OAuth flow again — same fix, two
 * different backend-detected causes. REVOKED (user disconnected) gets a
 * plain "Connect" instead, since there's nothing to "re-" about it. */
export function needsReconnect(status: ConnectionStatus): boolean {
  return status === "EXPIRED" || status === "ERROR";
}
