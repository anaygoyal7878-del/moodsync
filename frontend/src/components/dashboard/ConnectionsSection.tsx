import type { ReactNode } from "react";
import { HeartPulse, Apple, Watch, Lightbulb, Music, Mic } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/LinkButton";
import { DisconnectButton } from "./DisconnectButton";
import { SyncButton } from "./SyncButton";
import { ConnectionStatusBadge, needsReconnect } from "./ConnectionStatusBadge";
import { ALEXA_VOICE_COMMANDS } from "@/lib/alexaCommands";
import type { ConnectionsResponse, WearableConnectionSummary, SmartHomeConnectionSummary } from "@/lib/types";

const WEARABLE_LABELS: Record<string, string> = {
  WHOOP: "WHOOP",
  GOOGLE_HEALTH: "Fitbit",
  GARMIN: "Garmin",
  APPLE_HEALTH: "Apple Health",
  AMAZFIT: "Amazfit",
};
const SMART_HOME_LABELS: Record<string, string> = {
  HUE: "Philips Hue",
  SPOTIFY: "Spotify",
  ECOBEE: "Ecobee",
  ALEXA: "Amazon Alexa",
};

/** Neutral category pictograms, not brand marks — lucide has no literal
 * WHOOP/Fitbit/Hue/etc. logos, so these represent the provider's
 * category (wearable, smart light, music, voice) alongside the existing
 * text label, never replacing it. */
const PROVIDER_ICONS: Record<string, typeof HeartPulse> = {
  WHOOP: HeartPulse,
  GOOGLE_HEALTH: HeartPulse,
  APPLE_HEALTH: Apple,
  AMAZFIT: Watch,
  HUE: Lightbulb,
  SPOTIFY: Music,
  ALEXA: Mic,
};

function ProviderIcon({ provider }: { provider: string }) {
  const Icon = PROVIDER_ICONS[provider];
  if (!Icon) return null;
  return <Icon size={16} className="shrink-0 text-ink-muted" aria-hidden="true" />;
}

/** Absolute time, shown only as a `title=` tooltip on the relative-time
 * text (see formatRelativeSync) rather than as the primary display —
 * standardized on one relative-time format across every provider card
 * (previously WHOOP/Fitbit used this as the primary display while
 * Apple Health/Amazfit/Alexa used the relative one, an inconsistency
 * flagged in the redesign audit). */
function formatLastSynced(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return "Never synced";
  return `Last synced ${new Date(lastSyncedAt).toLocaleString()}`;
}

function formatRelativeSync(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return "Never synced";
  const ms = Date.now() - new Date(lastSyncedAt).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "Synced just now";
  if (minutes < 60) return `Synced ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Synced ${hours}h ago`;
  return `Synced ${Math.round(hours / 24)}d ago`;
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
            className={`h-1.5 w-1.5 rounded-full ${connection.batteryLevel <= 20 ? "bg-danger" : connection.batteryLevel <= 50 ? "bg-warning" : "bg-brand"}`}
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

/** Shared header row (icon + label + status badge + relative sync time)
 * every provider card renders identically — the one piece that was
 * duplicated across WHOOP/Fitbit's inline JSX and re-implemented
 * slightly differently in AppleHealthCard/AmazfitCard/AlexaCard before
 * this refactor. */
function ConnectionHeader({
  provider,
  label,
  connection,
}: {
  provider: string;
  label: string;
  connection: WearableConnectionSummary | SmartHomeConnectionSummary | undefined;
}) {
  const isActive = connection?.status === "ACTIVE";
  return (
    <>
      <div className="flex items-center gap-2">
        <ProviderIcon provider={provider} />
        <p className="text-sm font-medium">{label}</p>
      </div>
      {connection ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <ConnectionStatusBadge status={connection.status} />
          {isActive && (
            <span className="text-xs text-ink-muted" title={formatLastSynced(connection.lastSyncedAt)}>
              · {formatRelativeSync(connection.lastSyncedAt)}
            </span>
          )}
        </div>
      ) : (
        <p className="mt-1 text-xs text-ink-muted">Not connected</p>
      )}
    </>
  );
}

function WhoopCard({ connection }: { connection: WearableConnectionSummary | undefined }) {
  return (
    <Card className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 transition-colors hover:bg-surface-hover">
      <div className="min-w-0 flex-1">
        <ConnectionHeader provider="WHOOP" label={WEARABLE_LABELS.WHOOP as string} connection={connection} />
        {connection?.status === "ACTIVE" && <DeviceInfo connection={connection} />}
      </div>
      <ConnectAction
        connection={connection}
        connectHref="/api/integrations/whoop/connect"
        connectLabel="Connect WHOOP"
        provider="whoop"
        extraActiveActions={<SyncButton provider="whoop" />}
      />
    </Card>
  );
}

function FitbitCard({ connection }: { connection: WearableConnectionSummary | undefined }) {
  return (
    <Card className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 transition-colors hover:bg-surface-hover">
      <div className="min-w-0 flex-1">
        <ConnectionHeader provider="GOOGLE_HEALTH" label={WEARABLE_LABELS.GOOGLE_HEALTH as string} connection={connection} />
        {connection?.status === "ACTIVE" && <DeviceInfo connection={connection} />}
      </div>
      <ConnectAction
        connection={connection}
        connectHref="/api/integrations/google-health/connect"
        connectLabel="Connect Fitbit"
        provider="google-health"
        extraActiveActions={<SyncButton provider="google-health" />}
      />
    </Card>
  );
}

/** What MoodSync requests read access to via HealthKit — a fixed list,
 * not derived from any per-connection API response, because HealthKit
 * has no endpoint that reports which of these a user actually granted
 * (see docs/APPLE_HEALTH_ARCHITECTURE.md §8: read-permission denial is
 * deliberately invisible to apps, by Apple design). Showing this as
 * "requested," not "granted," is the honest framing — MoodSync cannot
 * know true per-type permission state, only what values a sync actually
 * returned. */
const APPLE_HEALTH_REQUESTED_METRICS = [
  "Heart rate",
  "Resting heart rate",
  "Heart rate variability",
  "Respiratory rate",
  "Blood oxygen",
  "Steps & active calories",
  "Sleep stages",
];

function AppleHealthCard({ connection }: { connection: WearableConnectionSummary | undefined }) {
  const isActive = connection?.status === "ACTIVE";

  return (
    <Card className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 transition-colors hover:bg-surface-hover">
      <div className="min-w-0 flex-1">
        <ConnectionHeader provider="APPLE_HEALTH" label={WEARABLE_LABELS.APPLE_HEALTH as string} connection={connection} />
        {isActive && <DeviceInfo connection={connection as WearableConnectionSummary} />}

        {isActive ? (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-ink-muted">
              <span className="font-medium text-ink">Permissions requested:</span> {APPLE_HEALTH_REQUESTED_METRICS.join(", ")}.
              iOS never tells any app which of these you actually allowed — if a metric is missing from your dashboard,
              it either wasn&apos;t granted or your device hasn&apos;t recorded it yet.
            </p>
            <p className="text-xs text-ink-muted">No battery status — Apple Health has no battery API for paired devices.</p>
          </div>
        ) : (
          <div className="mt-2 space-y-1.5 rounded-lg bg-surface-raised p-2.5 text-xs text-ink-muted">
            <p className="font-medium text-ink">HealthKit has no web sign-in — connect from the iOS app:</p>
            <ol className="list-decimal space-y-0.5 pl-4">
              <li>Install the MoodSync companion app on your iPhone.</li>
              <li>Sign in with this same MoodSync account.</li>
              <li>Allow the Health data permissions when prompted.</li>
              <li>Tap &quot;Sync now&quot; — this card updates automatically once data arrives.</li>
            </ol>
            <p>Reads: {APPLE_HEALTH_REQUESTED_METRICS.join(", ")}. Read-only — MoodSync never writes to your Health data.</p>
          </div>
        )}
      </div>
      {isActive && <DisconnectButton provider="apple-health" />}
    </Card>
  );
}

/** What the Zepp OS Mini Program's Device App reads via @zos/sensor — a
 * fixed list, same "requested, not confirmed-granted" framing as Apple
 * Health's metrics list, since there's no per-metric permission API to
 * query either (see docs/AMAZFIT_ARCHITECTURE.md §6). */
const AMAZFIT_SYNCED_METRICS = ["Heart rate", "Sleep score", "Steps"];

function AmazfitCard({ connection }: { connection: WearableConnectionSummary | undefined }) {
  const isActive = connection?.status === "ACTIVE";

  return (
    <Card className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 transition-colors hover:bg-surface-hover">
      <div className="min-w-0 flex-1">
        <ConnectionHeader provider="AMAZFIT" label={WEARABLE_LABELS.AMAZFIT as string} connection={connection} />

        {isActive ? (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-ink-muted">
              <span className="font-medium text-ink">Syncs:</span> {AMAZFIT_SYNCED_METRICS.join(", ")}. Sent from the
              MoodSync Mini Program on your watch each time you tap &quot;Sync&quot; — not continuous background sync.
            </p>
            <p className="text-xs text-ink-muted">No battery status — no Zepp OS sensor API for device battery was found.</p>
          </div>
        ) : (
          <div className="mt-2 space-y-1.5 rounded-lg bg-surface-raised p-2.5 text-xs text-ink-muted">
            <p className="font-medium text-ink">Amazfit has no web sign-in — connect from your watch:</p>
            <ol className="list-decimal space-y-0.5 pl-4">
              <li>Install the MoodSync Mini Program via the Zepp app (see the developer guide for the install QR code).</li>
              <li>Open the Mini Program&apos;s settings and log in with this same MoodSync account.</li>
              <li>Open the Mini Program on your watch and tap &quot;Sync&quot; — this card updates once data arrives.</li>
            </ol>
            <p>Reads: {AMAZFIT_SYNCED_METRICS.join(", ")}. Read-only — MoodSync never writes to your watch.</p>
          </div>
        )}
      </div>
      {isActive && <DisconnectButton provider="amazfit" />}
    </Card>
  );
}

function HueCard({ connection }: { connection: SmartHomeConnectionSummary | undefined }) {
  return (
    <Card className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 transition-colors hover:bg-surface-hover">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <ProviderIcon provider="HUE" />
          <p className="text-sm font-medium">{SMART_HOME_LABELS.HUE}</p>
        </div>
        {connection ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <ConnectionStatusBadge status={connection.status} />
            {connection.status === "ACTIVE" && (
              <span className="text-xs text-ink-muted" title={formatLastSynced(connection.lastSyncedAt)}>
                · {formatRelativeSync(connection.lastSyncedAt)} · {connection.devices.length} device
                {connection.devices.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        ) : (
          <p className="mt-1 text-xs text-ink-muted">Not connected</p>
        )}
      </div>
      <ConnectAction connection={connection} connectHref="/api/integrations/hue/connect" connectLabel="Connect Hue" provider="hue" />
    </Card>
  );
}

function SpotifyCard({ connection }: { connection: SmartHomeConnectionSummary | undefined }) {
  return (
    <Card className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 transition-colors hover:bg-surface-hover">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <ProviderIcon provider="SPOTIFY" />
          <p className="text-sm font-medium">{SMART_HOME_LABELS.SPOTIFY}</p>
        </div>
        {connection ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <ConnectionStatusBadge status={connection.status} />
          </div>
        ) : (
          <p className="mt-1 text-xs text-ink-muted">Not connected</p>
        )}
        <p className="mt-1 text-xs text-ink-muted">Requires Spotify Premium — free accounts can&apos;t use remote playback.</p>
      </div>
      <ConnectAction
        connection={connection}
        connectHref="/api/integrations/spotify/connect"
        connectLabel="Connect Spotify"
        provider="spotify"
      />
    </Card>
  );
}

function AlexaCard({ connection }: { connection: SmartHomeConnectionSummary | undefined }) {
  const isActive = connection?.status === "ACTIVE";

  return (
    <Card className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 transition-colors hover:bg-surface-hover">
      <div className="min-w-0 flex-1">
        <ConnectionHeader provider="ALEXA" label={SMART_HOME_LABELS.ALEXA as string} connection={connection} />

        {isActive ? (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-ink-muted">
              <span className="font-medium text-ink">Linked account:</span> this MoodSync account. MoodSync
              doesn&apos;t request your Amazon profile — only enough to identify you when the skill calls in.
            </p>
            <p className="text-xs text-ink-muted">
              <span className="font-medium text-ink">Skill status:</span> account linked and ready. If a
              command stops working, try unlinking and relinking from the Alexa app.
            </p>
            <p className="text-xs text-ink-muted">
              <span className="font-medium text-ink">Try saying:</span> &quot;Alexa, ask MoodSync{" "}
              {ALEXA_VOICE_COMMANDS.map((c, i) => (
                <span key={c}>
                  {i > 0 && (i === ALEXA_VOICE_COMMANDS.length - 1 ? ", or " : ", ")}
                  {c}
                </span>
              ))}
              .&quot;
            </p>
          </div>
        ) : (
          <div className="mt-2 space-y-1.5 rounded-lg bg-surface-raised p-2.5 text-xs text-ink-muted">
            <p className="font-medium text-ink">Link from the Alexa app — MoodSync can&apos;t start this from the dashboard:</p>
            <ol className="list-decimal space-y-0.5 pl-4">
              <li>Open the Alexa app and search for the &quot;MoodSync&quot; skill.</li>
              <li>Enable the skill, then tap &quot;Link account&quot;.</li>
              <li>Log in with this same MoodSync account and approve access.</li>
            </ol>
            <p>Once linked, try: &quot;Alexa, ask MoodSync {ALEXA_VOICE_COMMANDS[0]}.&quot;</p>
          </div>
        )}
      </div>
      {isActive && <DisconnectButton provider="alexa" />}
    </Card>
  );
}

export function ConnectionsSection({ connections }: { connections: ConnectionsResponse }) {
  const whoop = connections.wearables.find((c) => c.provider === "WHOOP");
  const fitbit = connections.wearables.find((c) => c.provider === "GOOGLE_HEALTH");
  const appleHealth = connections.wearables.find((c) => c.provider === "APPLE_HEALTH");
  const amazfit = connections.wearables.find((c) => c.provider === "AMAZFIT");
  const hue = connections.smartHome.find((c) => c.provider === "HUE");
  const spotify = connections.smartHome.find((c) => c.provider === "SPOTIFY");
  const alexa = connections.smartHome.find((c) => c.provider === "ALEXA");

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Connections</h2>

      <WhoopCard connection={whoop} />
      <FitbitCard connection={fitbit} />
      <AppleHealthCard connection={appleHealth} />
      <AmazfitCard connection={amazfit} />
      <HueCard connection={hue} />
      <SpotifyCard connection={spotify} />
      <AlexaCard connection={alexa} />
    </section>
  );
}
