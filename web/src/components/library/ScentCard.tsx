import { ChevronRight } from 'lucide-react';
import { Card } from '../ui/Card';
import { StateIcon } from '../ui/StateIcon';
import { ConfidenceBadge } from '../ui/ConfidenceBadge';
import { wellnessStateMeta } from '../../data/wellnessStates';
import { stateBgSoftClass, stateTextClass } from '../../data/stateStyles';
import type { ConfidenceLevel, ScentProfile } from '../../types/domain';

const confidenceRank: Record<ConfidenceLevel, number> = { high: 3, moderate: 2, low: 1, insufficient: 0 };

function topConfidence(scent: ScentProfile): ConfidenceLevel {
  return scent.evidence.reduce<ConfidenceLevel>(
    (best, entry) => (confidenceRank[entry.confidence] > confidenceRank[best] ? entry.confidence : best),
    'insufficient',
  );
}

export function ScentCard({ scent, onSelect }: { scent: ScentProfile; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} className="text-left">
      <Card className="h-full transition-colors hover:bg-surface-raised">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-base font-semibold tracking-tight">{scent.name}</p>
            <p className="text-xs italic text-ink-muted">{scent.latinName}</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
        </div>

        <p className="mt-2 line-clamp-2 text-sm text-ink-secondary">{scent.description}</p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {scent.primaryEffects.length === 0 ? (
            <span className="text-xs text-ink-muted">No strong evidence-backed use case yet</span>
          ) : (
            scent.primaryEffects.map((effect) => {
              const meta = wellnessStateMeta[effect];
              return (
                <span
                  key={effect}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${stateBgSoftClass[effect]} ${stateTextClass[effect]}`}
                >
                  <StateIcon icon={meta.icon} className="h-3 w-3" />
                  {meta.label}
                </span>
              );
            })
          )}
        </div>

        <div className="mt-3 border-t border-line pt-3">
          <ConfidenceBadge level={topConfidence(scent)} />
        </div>
      </Card>
    </button>
  );
}
