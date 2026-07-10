import { AnimatePresence, motion } from 'framer-motion';
import { Bluetooth, Loader2, Plug, SprayCan, X } from 'lucide-react';
import { useDeviceStore } from '../../store/useDeviceStore';
import { providerLabels } from '../../devices/deviceCatalog';
import { BatteryIndicator } from './BatteryIndicator';

export function ConnectDeviceModal() {
  const scanState = useDeviceStore((s) => s.scanState);
  const discovered = useDeviceStore((s) => s.discovered);
  const connectingId = useDeviceStore((s) => s.connectingId);
  const connectDevice = useDeviceStore((s) => s.connectDevice);
  const closeScan = useDeviceStore((s) => s.closeScan);

  const isOpen = scanState !== 'idle';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/60"
            onClick={closeScan}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-hidden="true"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="connect-modal-title"
            className="relative z-10 max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-surface-raised p-6 sm:rounded-2xl"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 0.6, 0.4, 1] }}
          >
            <div className="flex items-start justify-between">
              <h2 id="connect-modal-title" className="text-lg font-semibold tracking-tight">
                Add a diffuser
              </h2>
              <button
                type="button"
                onClick={closeScan}
                aria-label="Close"
                className="rounded-full p-1.5 text-ink-secondary hover:bg-surface hover:text-ink"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {scanState === 'scanning' && (
              <div className="flex flex-col items-center gap-4 py-14">
                <div className="relative flex h-16 w-16 items-center justify-center">
                  <span
                    className="absolute inset-0 rounded-full border border-brand/50"
                    style={{ animation: 'pulseRing 1.6s cubic-bezier(0.2,0.6,0.4,1) infinite' }}
                    aria-hidden="true"
                  />
                  <Bluetooth className="h-7 w-7 text-brand" aria-hidden="true" />
                </div>
                <p className="text-sm text-ink-secondary">Searching for nearby diffusers…</p>
              </div>
            )}

            {scanState === 'results' && (
              <div className="mt-4 space-y-2.5">
                {discovered.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-muted">
                    No new diffusers found nearby. Already-connected devices won't show up again.
                  </p>
                ) : (
                  discovered.map((candidate) => {
                    const isConnecting = connectingId === candidate.id;
                    return (
                      <div
                        key={candidate.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3.5"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-hover">
                            <SprayCan className="h-4 w-4 text-ink-secondary" aria-hidden="true" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-ink">{candidate.name}</p>
                            <p className="text-xs text-ink-muted">
                              {providerLabels[candidate.provider]} &middot; {candidate.room}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <BatteryIndicator battery={candidate.battery} isPluggedIn={candidate.isPluggedIn} />
                          <button
                            type="button"
                            disabled={connectingId !== null}
                            onClick={() => connectDevice(candidate.id)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-medium text-canvas transition-colors hover:bg-brand-hover disabled:opacity-40"
                          >
                            {isConnecting ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                Connecting
                              </>
                            ) : (
                              <>
                                <Plug className="h-3.5 w-3.5" aria-hidden="true" />
                                Connect
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
