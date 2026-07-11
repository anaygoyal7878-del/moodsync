import { Card } from "@/components/ui/Card";
import { DeviceCard } from "./DeviceCard";
import type { DeviceSummary } from "@/lib/types";

export function DevicesSection({ devices }: { devices: DeviceSummary[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Connected devices</h2>

      {devices.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-secondary">
            No devices yet. Connect Hue to sync your lights.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {devices.map((device) => (
            <DeviceCard key={device.id} device={device} />
          ))}
        </div>
      )}
    </section>
  );
}
