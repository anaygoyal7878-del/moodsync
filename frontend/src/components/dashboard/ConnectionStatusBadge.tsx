import { Badge } from "@/components/ui/Badge";
import type { ConnectionStatus } from "@/lib/types";

const STATUS_CONFIG: Record<ConnectionStatus, { label: string; variant: "brand" | "warning" | "danger" | "neutral" }> = {
  ACTIVE: { label: "Connected", variant: "brand" },
  EXPIRED: { label: "Needs reconnect", variant: "warning" },
  ERROR: { label: "Connection error", variant: "danger" },
  REVOKED: { label: "Disconnected", variant: "neutral" },
  NOT_YET_AVAILABLE: { label: "Not available", variant: "neutral" },
};

/** Small colored-dot + label pair shared by every connection card, so
 * WHOOP/Fitbit/Hue/Spotify never drift on what EXPIRED vs ERROR vs
 * REVOKED actually looks like to the user. Wraps the shared `Badge`
 * primitive rather than duplicating dot+label markup. */
export function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  const { label, variant } = STATUS_CONFIG[status];
  return (
    <Badge variant={variant} dot>
      {label}
    </Badge>
  );
}

/** EXPIRED (token refresh failed) and ERROR (a sync call failed) both
 * need the user to go through the OAuth flow again — same fix, two
 * different backend-detected causes. REVOKED (user disconnected) gets a
 * plain "Connect" instead, since there's nothing to "re-" about it. */
export function needsReconnect(status: ConnectionStatus): boolean {
  return status === "EXPIRED" || status === "ERROR";
}
