import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ShieldAlert } from 'lucide-react';
import { ConfidenceBadge } from '../ui/ConfidenceBadge';
import { StateIcon } from '../ui/StateIcon';
import { wellnessStateMeta } from '../../data/wellnessStates';
import { stateBgSoftClass, stateTextClass } from '../../data/stateStyles';
import type { ScentProfile } from '../../types/domain';

export function ScentDetailDrawer({ scent, onClose }: { scent: ScentProfile | null; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (scent) closeButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [scent, onClose]);

  return (
    <AnimatePresence>
      {scent && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-hidden="true"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="scent-drawer-title"
            className="relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-surface-raised p-6 sm:rounded-2xl"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 0.6, 0.4, 1] }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="scent-drawer-title" className="text-xl font-semibold tracking-tight">
                  {scent.name}
                </h2>
                <p className="text-sm italic text-ink-muted">
                  {scent.latinName} &middot; {scent.family}
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full p-1.5 text-ink-secondary hover:bg-surface hover:text-ink"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-ink-secondary">{scent.description}</p>

            {scent.primaryEffects.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {scent.primaryEffects.map((effect) => {
                  const meta = wellnessStateMeta[effect];
                  return (
                    <span
                      key={effect}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${stateBgSoftClass[effect]} ${stateTextClass[effect]}`}
                    >
                      <StateIcon icon={meta.icon} className="h-3.5 w-3.5" />
                      {meta.label}
                    </span>
                  );
                })}
              </div>
            )}

            <section className="mt-6">
              <h3 className="text-sm font-semibold text-ink">Evidence</h3>
              <div className="mt-3 space-y-3">
                {scent.evidence.map((entry) => (
                  <div key={entry.effect} className="rounded-xl border border-line bg-surface p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{entry.effect}</p>
                      <ConfidenceBadge level={entry.confidence} />
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{entry.summary}</p>
                    <p className="mt-2 text-xs text-ink-muted">Source: {entry.citation}</p>
                  </div>
                ))}
              </div>
            </section>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-ink">Best time of day</h3>
                <p className="mt-1.5 text-sm text-ink-secondary">
                  {scent.bestTimeOfDay.length > 0 ? scent.bestTimeOfDay.join(', ') : 'No specific guidance'}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink">Compatible blends</h3>
                <p className="mt-1.5 text-sm text-ink-secondary">
                  {scent.compatibleBlends.length > 0 ? scent.compatibleBlends.join(', ') : 'None noted'}
                </p>
              </div>
            </div>

            {scent.safetyNotes.length > 0 && (
              <section className="mt-6 rounded-xl border border-state-energize/30 bg-state-energize/10 p-3.5">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-state-energize" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-ink">Safety notes</h3>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {scent.safetyNotes.map((note, i) => (
                    <li key={i} className="text-sm leading-relaxed text-ink-secondary">
                      {note}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
