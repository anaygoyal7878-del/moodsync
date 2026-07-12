import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/LinkButton";
import { DisconnectButton } from "./DisconnectButton";
import { SyncButton } from "./SyncButton";
import { ConnectionStatusBadge, needsReconnect } from "./ConnectionStatusBadge";
import type { ConnectionsResponse, WearableConnectionSummary, SmartHomeConnectionSummary } from "@/lib/types";

const WEARABLE_LABELS: Record<string, string> = {
  WHOOP: "WHOOP",
  GOOGLE_HEALTH: "Fitbit",
  GARMIN: "Garmin",
  APPLE_HEALTH: "Apple Health",
};
const SMART_HOME_LABELS: Record<string, string> = { HUE: "Philips Hue", SPOTIFY: "Spotify", ECOBEE: "Ecobee" };

function formatLastSynced(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return "Never synced";
  return `Last synced ${new Date(lastSyncedAt).toLocaleString()}`;
}

/** Renders nothing when the provider doesn't expose device/battery info
 * (e.g. WHOOP's public API has no battery endpoint) — this is a real
 * absence, not a loading state, so there's no placeholder to show. */
function DeviceInfo({ connection }: { connection: WearableConnectionSummary }) {
  if (!connection.deviceName && connection.batteryLevel === null) return null;

  return (
    <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
      {connection.deviceName && <span>{connection.deviceName}</span>}
      {connection.batteryLevel !== null && (
        <span className="inline-flex items-center gap-1">
          <span
            className={`h-1.5 w-1.5 rounded-full ${connection.batteryLevel <= 20 ? "bg-red-400" : connection.batteryLevel <= 50 ? "bg-amber-400" : "bg-brand"}`}
            aria-hidden="true"
          />
          {connection.batteryLevel}% battery
        </span>
      )}
    </p>
  );
}

function ConnectAction({
  connection,
  connectHref,
  connectLabel,
  provider,
  extraActiveActions,
}: {
  connection: WearableConnectionSummary | SmartHomeConnectionSummary | undefined;
  connectHref: string;
  connectLabel: string;
  provider: "whoop" | "hue" | "google-health" | "spotify";
  extraActiveActions?: ReactNode;
}) {
  if (connection?.status === "ACTIVE") {
    return (
      <div className="flex shrink-0 items-center gap-2">
        {extraActiveActions}
        <DisconnectButton provider={provider} />
      </div>
    );
  }

  if (connection && needsReconnect(connection.status)) {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <LinkButton href={connectHref} variant="primary">
          Reconnect
        </LinkButton>
        <DisconnectButton provider={provider} />
      </div>
    );
  }

  return (
    <LinkButton href={connectHref} variant="primary">
      {connectLabel}
    </LinkButton>
  );
}

export function ConnectionsSection({ connections }: { connections: ConnectionsResponse }) {
  const whoop = connections.wearables.find((c) => c.provider === "WHOOP");
  const fitbit = connections.wearables.find((c) => c.provider === "GOOGLE_HEALTH");
  const appleHealth = connections.wearables.find((c) => c.provider === "APPLE_HEALTH");
  const hue = connections.smartHome.find((c) => c.provider === "HUE");
  const spotify = connections.smartHome.find((c) => c.provider === "SPOTIFY");

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Connections</h2>

      <Card className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 transition-colors hover:bg-surface-hover">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{WEARABLE_LABELS.WHOOP}</p>
          {whoop ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <ConnectionStatusBadge status={whoop.status} />
              {whoop.status === "ACTIVE" && (
                <span className="text-xs text-ink-muted">· {formatLastSynced(whoop.lastSyncedAt)}</span>
              )}
            </div>
          ) : (
            <p className="mt-1 text-xs text-ink-muted">Not connected</p>
          )}
          {whoop?.status === "ACTIVE" && <DeviceInfo connection={whoop} />}
        </div>
        <ConnectAction
          connection={whoop}
          connectHref="/api/integrations/whoop/connect"
          connectLabel="Connect WHOOP"
          provider="whoop"
          extraActiveActions={<SyncButton provider="whoop" />}
        />
      </Card>

      <Card className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 transition-colors hover:bg-surface-hover">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{WEARABLE_LABELS.GOOGLE_HEALTH}</p>
          {fitbit ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <ConnectionStatusBadge status={fitbit.status} />
              {fitbit.status === "ACTIVE" && (
                <span className="text-xs text-ink-muted">· {formatLastSynced(fitbit.lastSyncedAt)}</span>
              )}
            </div>
          ) : (
            <p className="mt-1 text-xs text-ink-muted">Not connected</p>
          )}
          {fitbit?.status === "ACTIVE" && <DeviceInfo connection={fitbit} />}
        </div>
        <ConnectAction
          connection={fitbit}
          connectHref="/api/integrations/google-health/connect"
          connectLabel="Connect Fitbit"
          provider="google-health"
          extraActiveActions={<SyncButton provider="google-health" />}
        />
      </Card>

      <Card className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 transition-colors hover:bg-surface-hover">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{WEARABLE_LABELS.APPLE_HEALTH}</p>
          {appleHealth?.status === "ACTIVE" ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <ConnectionStatusBadge status={appleHealth.status} />
              <span className="text-xs text-ink-muted">· {formatLastSynced(appleHealth.lastSyncedAt)}</span>
            </div>
          ) : (
            <p className="mt-1 text-xs text-ink-muted">
              {appleHealth ? "Disconnected" : "Not connected"} · sign in from the MoodSync iOS app to connect
            </p>
          )}
          <p className="mt-1 text-xs text-ink-muted">
            HealthKit has no web-based OAuth flow — connecting only happens by signing into this account from the
            iOS companion app.
          </p>
        </div>
        {appleHealth?.status === "ACTIVE" && <DisconnectButton provider="apple-health" />}
      </Card>

      <Card className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 transition-colors hover:bg-surface-hover">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{SMART_HOME_LABELS.HUE}</p>
          {hue ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <ConnectionStatusBadge status={hue.status} />
              {hue.status === "ACTIVE" && (
                <span className="text-xs text-ink-muted">
                  · {formatLastSynced(hue.lastSyncedAt)} · {hue.devices.length} device{hue.devices.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
          ) : (
            <p className="mt-1 text-xs text-ink-muted">Not connected</p>
          )}
        </div>
        <ConnectAction connection={hue} connectHref="/api/integrations/hue/connect" connectLabel="Connect Hue" provider="hue" />
      </Card>

      <Card className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 transition-colors hover:bg-surface-hover">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{SMART_HOME_LABELS.SPOTIFY}</p>
          {spotify ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <ConnectionStatusBadge status={spotify.status} />
            </div>
          ) : (
            <p className="mt-1 text-xs text-ink-muted">Not connected</p>
          )}
          <p className="mt-1 text-xs text-ink-muted">Requires Spotify Premium — free accounts can&apos;t use remote playback.</p>
        </div>
        <ConnectAction
          connection={spotify}
          connectHref="/api/integrations/spotify/connect"
          connectLabel="Connect Spotify"
          provider="spotify"
        />
      </Card>
    </section>
  );
}
