import Link from "next/link";
import { Lightbulb, Music, Mic, Thermometer } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/LinkButton";
import { DeviceCard } from "./DeviceCard";
import { ConnectionStatusBadge } from "./ConnectionStatusBadge";
import { DisconnectButton } from "./DisconnectButton";
import { ALEXA_VOICE_COMMANDS } from "@/lib/alexaCommands";
import type { SmartHomeConnectionSummary } from "@/lib/types";

const PROVIDER_LABELS: Record<string, string> = {
  HUE: "Philips Hue",
  SPOTIFY: "Spotify",
  ECOBEE: "Ecobee",
  ALEXA: "Amazon Alexa",
};

const PROVIDER_ICONS: Record<string, typeof Lightbulb> = {
  HUE: Lightbulb,
  SPOTIFY: Music,
  ALEXA: Mic,
  ECOBEE: Thermometer,
};

const DISCONNECT_SLUGS: Record<string, "hue" | "spotify" | "alexa"> = {
  HUE: "hue",
  SPOTIFY: "spotify",
  ALEXA: "alexa",
};

/** Hue is the only smart-home provider whose devices MoodSync actually
 * enumerates (real per-light discovery via Hue's API — see
 * backend/src/services/hueService.ts). Spotify and Alexa are real
 * connections with real capabilities, but neither exposes a device list
 * to MoodSync: Spotify controls whatever's currently playing on
 * *some* device the user already has open (not a MoodSync-visible
 * inventory), and Alexa (a Custom Skill, not a Smart Home Skill — see
 * docs/ALEXA_ARCHITECTURE.md §1) has no device-discovery API at all,
 * only voice intents. This section is honest about that distinction
 * rather than fabricating a device list for either. */
function ProviderCard({ connection }: { connection: SmartHomeConnectionSummary }) {
  const Icon = PROVIDER_ICONS[connection.provider];
  const label = PROVIDER_LABELS[connection.provider] ?? connection.provider;
  const disconnectSlug = DISCONNECT_SLUGS[connection.provider];

  return (
    <Card className="flex flex-col gap-2 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-brand">
            {Icon && <Icon size={16} aria-hidden="true" />}
          </span>
          <div>
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-ink-muted">
              {connection.lastSyncedAt ? `Synced ${new Date(connection.lastSyncedAt).toLocaleString()}` : "Not synced yet"}
            </p>
          </div>
        </div>
        <ConnectionStatusBadge status={connection.status} />
      </div>

      {connection.provider === "ALEXA" && connection.status === "ACTIVE" && (
        <p className="mt-1 text-xs text-ink-muted">
          No device list — Alexa is a voice skill, not a device connection. Try: &quot;Alexa, ask MoodSync{" "}
          {ALEXA_VOICE_COMMANDS[0]}.&quot; See the full command list on the{" "}
          <Link href="/dashboard/connections" className="underline underline-offset-2">
            Connections page
          </Link>
          .
        </p>
      )}
      {connection.provider === "SPOTIFY" && connection.status === "ACTIVE" && (
        <p className="mt-1 text-xs text-ink-muted">
          No device list — automations play to whatever device Spotify is already active on, not a MoodSync-managed
          device.
        </p>
      )}

      {disconnectSlug && connection.status === "ACTIVE" && (
        <div className="mt-1">
          <DisconnectButton provider={disconnectSlug} />
        </div>
      )}
    </Card>
  );
}

export function DevicesSection({ smartHome }: { smartHome: SmartHomeConnectionSummary[] }) {
  const hue = smartHome.find((c) => c.provider === "HUE");
  const others = smartHome.filter((c) => c.provider !== "HUE");
  const hueDevices = hue?.devices ?? [];

  const hasAnything = smartHome.length > 0;

  return (
    <div className="flex flex-col gap-8">
      {!hasAnything ? (
        <Card>
          <p className="text-sm font-medium text-ink">No devices connected yet</p>
          <p className="mt-1 text-sm text-ink-secondary">
            Connect Philips Hue, Spotify, or Amazon Alexa from the Connections page to see them here.
          </p>
          <LinkButton href="/dashboard/connections" variant="primary" className="mt-3 inline-flex">
            Go to Connections
          </LinkButton>
        </Card>
      ) : (
        <>
          {hue && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Philips Hue lights</h2>
                <Badge variant="neutral">{hueDevices.length} light{hueDevices.length === 1 ? "" : "s"}</Badge>
              </div>
              {hueDevices.length === 0 ? (
                <Card>
                  <p className="text-sm text-ink-secondary">
                    Hue is connected but no lights have synced yet — try a manual sync from the Connections page.
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {hueDevices.map((device, i) => (
                    <div key={device.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
                      <DeviceCard device={device} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {others.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Connected services</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {others.map((connection, i) => (
                  <div key={connection.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
                    <ProviderCard connection={connection} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
