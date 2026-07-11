"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DeviceSummary } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

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

  return (
    <Card className="flex flex-col gap-2 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{device.name}</p>
          <p className="text-xs text-ink-muted">
            {device.room ?? device.deviceType} · {device.isOnline ? "Online" : "Offline"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={pending} onClick={() => setLightState({ on: true, brightness: 80 })}>
            On
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => setLightState({ on: false })}>
            Off
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </Card>
  );
}
