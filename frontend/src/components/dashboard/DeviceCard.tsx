"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, Thermometer, Speaker, Lock, Cpu } from "lucide-react";
import type { DeviceSummary } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

/** Only `deviceType: 'light'` is populated today (Hue is the only
 * device-syncing provider — see backend/src/services/hueService.ts) but
 * the mapping covers the shapes other providers would plausibly report,
 * with a neutral fallback for anything unrecognized. */
const DEVICE_ICONS: Record<string, typeof Lightbulb> = {
  light: Lightbulb,
  thermostat: Thermometer,
  speaker: Speaker,
  lock: Lock,
};

export function DeviceCard({ device }: { device: DeviceSummary }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setLightState(state: { on?: boolean; brightness?: number }) {
    setPending(true);
    setError(null);

    const response = await fetch(`/api/integrations/hue/devices/${device.externalDeviceId}/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Couldn't update this device");
    }
    setPending(false);
    router.refresh();
  }

  const Icon = DEVICE_ICONS[device.deviceType] ?? Cpu;

  return (
    <Card className="flex flex-col gap-2 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-ink-secondary">
            <Icon size={16} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium">{device.name}</p>
            <p className="text-xs text-ink-muted">{device.room ?? device.deviceType}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={device.isOnline ? "success" : "neutral"} dot>
            {device.isOnline ? "Online" : "Offline"}
          </Badge>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" disabled={pending} onClick={() => setLightState({ on: true, brightness: 80 })}>
          On
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => setLightState({ on: false })}>
          Off
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}
