import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Info, Hand, Zap } from 'lucide-react';
import { Card } from '../ui/Card';
import { ConfidenceBadge } from '../ui/ConfidenceBadge';
import type { ScentRecommendation } from '../../types/domain';

interface AutomationSummary {
  autoCount: number;
  manualCount: number;
}

export function ScentRecommendationCard({
  recommendation,
  automationSummary,
}: {
  recommendation: ScentRecommendation | null;
  automationSummary?: AutomationSummary;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!recommendation) {
    return (
      <Card className="flex items-center justify-center py-10 text-ink-muted">
        No scent recommendation for this reading yet
      </Card>
    );
  }

  const { scent } = recommendation;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted">Recommended scent</p>
          <p className="mt-1 text-xl font-semibold tracking-tight">{scent.name}</p>
          <p className="text-sm italic text-ink-muted">{scent.latinName}</p>
        </div>
        <ConfidenceBadge level={recommendation.confidence} />
      </div>

      {automationSummary && (automationSummary.autoCount > 0 || automationSummary.manualCount > 0) && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted">
          {automationSummary.autoCount > 0 ? (
            <>
              <Zap className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
              Applying automatically to {automationSummary.autoCount}{' '}
              {automationSummary.autoCount === 1 ? 'device' : 'devices'}
              {automationSummary.manualCount > 0 && ` · ${automationSummary.manualCount} on manual`}
            </>
          ) : (
            <>
              <Hand className="h-3.5 w-3.5" aria-hidden="true" />
              All devices on manual — this recommendation won't be applied automatically
            </>
          )}
        </div>
      )}

      <p className="mt-3 text-sm leading-relaxed text-ink-secondary">{scent.description}</p>

      {recommendation.isFallback && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs text-ink-secondary">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-state-focus" aria-hidden="true" />
          This is a related suggestion, not a direct evidence match for this state — see below.
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-4 flex w-full items-center justify-between rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-raised hover:text-ink"
      >
        Why this scent
        <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.2, 0.6, 0.4, 1] }}
            className="overflow-hidden"
          >
            <ul className="mt-3 space-y-2.5 border-t border-line pt-3">
              {recommendation.explanation.map((line, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink-secondary">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-muted" aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
