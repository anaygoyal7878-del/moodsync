import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { useDeviceStore } from '../store/useDeviceStore';
import { DeviceCard } from '../components/devices/DeviceCard';
import { ConnectDeviceModal } from '../components/devices/ConnectDeviceModal';
import { Button } from '../components/ui/Button';

const container = { animate: { transition: { staggerChildren: 0.06 } } };
const item = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

export function DevicesPage() {
  const devices = useDeviceStore((s) => s.devices);
  const startScan = useDeviceStore((s) => s.startScan);

  const autoCount = devices.filter((d) => d.mode === 'auto').length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Devices</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            {devices.length === 0
              ? 'No diffusers connected yet'
              : `${autoCount} of ${devices.length} on auto mode`}
          </p>
        </div>
        <Button variant="primary" onClick={() => startScan()}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add
        </Button>
      </div>

      {devices.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl2 border border-dashed border-line-strong py-16 text-center">
          <p className="text-sm text-ink-secondary">Connect a diffuser to let MoodSync control it automatically.</p>
          <Button variant="secondary" onClick={() => startScan()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Scan for diffusers
          </Button>
        </div>
      ) : (
        <motion.div variants={container} initial="initial" animate="animate" className="flex flex-col gap-3">
          {devices.map((device) => (
            <motion.div key={device.id} variants={item}>
              <DeviceCard device={device} />
            </motion.div>
          ))}
        </motion.div>
      )}

      <div className="rounded-xl2 border border-line bg-surface p-4 text-xs leading-relaxed text-ink-muted">
        <span className="font-medium text-ink-secondary">Auto</span> lets MoodSync change scent and intensity as your
        wellness state changes. <span className="font-medium text-ink-secondary">Manual</span> pauses automation for
        that device until you switch it back — MoodSync will still show recommendations, it just won't act on them.
      </div>

      <ConnectDeviceModal />
    </div>
  );
}
