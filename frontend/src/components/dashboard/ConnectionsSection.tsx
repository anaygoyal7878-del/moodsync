import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/LinkButton";
import { DisconnectButton } from "./DisconnectButton";
import { SyncButton } from "./SyncButton";
import type { ConnectionsResponse } from "@/lib/types";

const WEARABLE_LABELS: Record<string, string> = { WHOOP: "WHOOP", GOOGLE_HEALTH: "Fitbit", GARMIN: "Garmin" };
const SMART_HOME_LABELS: Record<string, string> = { HUE: "Philips Hue", SPOTIFY: "Spotify", ECOBEE: "Ecobee" };

function formatLastSynced(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return "Never synced";
  return `Last synced ${new Date(lastSyncedAt).toLocaleString()}`;
}

export function ConnectionsSection({ connections }: { connections: ConnectionsResponse }) {
  const whoop = connections.wearables.find((c) => c.provider === "WHOOP");
  const fitbit = connections.wearables.find((c) => c.provider === "GOOGLE_HEALTH");
  const hue = connections.smartHome.find((c) => c.provider === "HUE");

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Connections</h2>

      <Card className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{WEARABLE_LABELS.WHOOP}</p>
          <p className="text-xs text-ink-muted">
            {whoop?.status === "ACTIVE" ? formatLastSynced(whoop.lastSyncedAt) : "Not connected"}
          </p>
        </div>
        {whoop?.status === "ACTIVE" ? (
          <div className="flex items-center gap-2">
            <SyncButton provider="whoop" />
            <DisconnectButton provider="whoop" />
          </div>
        ) : (
          <LinkButton href="/api/integrations/whoop/connect" variant="primary">
            Connect WHOOP
          </LinkButton>
        )}
      </Card>

      <Card className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{WEARABLE_LABELS.GOOGLE_HEALTH}</p>
          <p className="text-xs text-ink-muted">
            {fitbit?.status === "ACTIVE" ? formatLastSynced(fitbit.lastSyncedAt) : "Not connected"}
          </p>
        </div>
        {fitbit?.status === "ACTIVE" ? (
          <div className="flex items-center gap-2">
            <SyncButton provider="google-health" />
            <DisconnectButton provider="google-health" />
          </div>
        ) : (
          <LinkButton href="/api/integrations/google-health/connect" variant="primary">
            Connect Fitbit
          </LinkButton>
        )}
      </Card>

      <Card className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{SMART_HOME_LABELS.HUE}</p>
          <p className="text-xs text-ink-muted">
            {hue?.status === "ACTIVE"
              ? `${formatLastSynced(hue.lastSyncedAt)} · ${hue.devices.length} device${hue.devices.length === 1 ? "" : "s"}`
              : "Not connected"}
          </p>
        </div>
        {hue?.status === "ACTIVE" ? (
          <DisconnectButton provider="hue" />
        ) : (
          <LinkButton href="/api/integrations/hue/connect" variant="primary">
            Connect Hue
          </LinkButton>
        )}
      </Card>
    </section>
  );
}
