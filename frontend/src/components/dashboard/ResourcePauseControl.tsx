"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

const PROVIDERS = [
  { value: "hue", label: "Hue" },
  { value: "spotify", label: "Spotify" },
  { value: "ecobee", label: "Ecobee" },
  { value: "alexa", label: "Alexa" },
  { value: "homekit", label: "HomeKit" },
] as const;

const PROVIDER_LABEL: Record<string, string> = Object.fromEntries(PROVIDERS.map((p) => [p.value, p.label]));

/** Per-provider companion to PauseAutomationsButton's "pause everything"
 * — lets a user pause just one smart-home provider's actions (e.g.
 * "leave my Hue lights alone") while every other rule keeps running.
 * See ResourcePause in schema.prisma and ai/src/dispatch.ts's per-action
 * pause check. */
export function ResourcePauseControl({ activePauses }: { activePauses: Record<string, string> }) {
  const router = useRouter();
  const [provider, setProvider] = useState<string>(PROVIDERS[0].value);
  const [pending, setPending] = useState(false);

  async function pauseProvider() {
    setPending(true);
    await fetch(`/api/preferences/automation-pause/resource/${provider}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutes: 60 }),
    });
    router.refresh();
    setPending(false);
  }

  async function resumeProvider(p: string) {
    setPending(true);
    await fetch(`/api/preferences/automation-pause/resource/${p}`, { method: "DELETE" });
    router.refresh();
    setPending(false);
  }

  const pausedProviders = Object.keys(activePauses);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-auto" value={provider} onChange={(e) => setProvider(e.target.value)}>
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
        <Button variant="ghost" disabled={pending} onClick={pauseProvider}>
          Pause this provider for 1 hour
        </Button>
      </div>

      {pausedProviders.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {pausedProviders.map((p) => (
            <Badge key={p} variant="warning" dot>
              <button type="button" disabled={pending} onClick={() => resumeProvider(p)} className="hover:underline">
                {PROVIDER_LABEL[p] ?? p} paused until {new Date(activePauses[p]!).toLocaleTimeString()} — resume
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
