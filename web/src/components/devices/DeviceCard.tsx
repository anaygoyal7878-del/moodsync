import { SprayCan, MoreVertical, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Card } from '../ui/Card';
import { BatteryIndicator } from './BatteryIndicator';
import { ModeToggle } from './ModeToggle';
import { providerLabels } from '../../devices/deviceCatalog';
import { useDeviceStore } from '../../store/useDeviceStore';
import type { DiffuserDevice } from '../../types/device';

export function DeviceCard({ device }: { device: DiffuserDevice }) {
  const setMode = useDeviceStore((s) => s.setMode);
  const removeDevice = useDeviceStore((s) => s.removeDevice);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Card raised className="relative">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/15">
            <SprayCan className="h-5 w-5 text-brand" aria-hidden="true" />
          </div>
          <div>
            <p className="text-base font-semibold tracking-tight">{device.name}</p>
            <p className="text-xs text-ink-muted">
              {providerLabels[device.provider]} &middot; {device.room}
            </p>
          </div>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={`More options for ${device.name}`}
            aria-expanded={menuOpen}
            className="rounded-full p-1.5 text-ink-muted hover:bg-surface-hover hover:text-ink"
          >
            <MoreVertical className="h-4 w-4" aria-hidden="true" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-9 z-10 w-40 overflow-hidden rounded-xl border border-line bg-surface-raised shadow-card"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                type="button"
                onClick={() => {
                  removeDevice(device.id);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-400 hover:bg-surface-hover"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Forget device
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3.5">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-secondary">
            <span
              className={`h-1.5 w-1.5 rounded-full ${device.isOnline ? 'bg-state-recover' : 'bg-ink-muted'}`}
              aria-hidden="true"
            />
            {device.isOnline ? 'Online' : 'Offline'}
          </span>
          <BatteryIndicator battery={device.battery} isPluggedIn={device.isPluggedIn} />
        </div>

        <ModeToggle mode={device.mode} onChange={(mode) => setMode(device.id, mode)} />
      </div>
    </Card>
  );
}
