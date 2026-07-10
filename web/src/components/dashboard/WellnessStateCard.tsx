import { motion } from 'framer-motion';
import { Card } from '../ui/Card';
import { StateIcon } from '../ui/StateIcon';
import { wellnessStateMeta } from '../../data/wellnessStates';
import { stateBgClass, stateBgSoftClass, stateTextClass } from '../../data/stateStyles';
import type { WellnessAssessment } from '../../types/domain';

export function WellnessStateCard({ assessment }: { assessment: WellnessAssessment | null }) {
  if (!assessment) {
    return (
      <Card raised className="flex items-center justify-center py-10 text-ink-muted">
        Waiting for the first reading…
      </Card>
    );
  }

  const meta = wellnessStateMeta[assessment.state];
  const confidencePct = Math.round(assessment.confidence * 100);

  return (
    <Card raised className="relative overflow-hidden">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${stateBgClass[meta.id]}`} aria-hidden="true" />
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-full ${stateBgSoftClass[meta.id]}`}>
            <StateIcon icon={meta.icon} className={`h-5 w-5 ${stateTextClass[meta.id]}`} />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight">{meta.label}</p>
            <p className="text-sm text-ink-secondary">{meta.tagline}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">{confidencePct}%</p>
          <p className="text-xs text-ink-muted">match</p>
        </div>
      </div>

      <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-surface">
        <motion.div
          className={`h-full rounded-full ${stateBgClass[meta.id]}`}
          initial={{ width: 0 }}
          animate={{ width: `${confidencePct}%` }}
          transition={{ duration: 0.6, ease: [0.2, 0.6, 0.4, 1] }}
        />
      </div>

      {assessment.contributingFactors.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {assessment.contributingFactors.map((factor) => (
            <li
              key={factor.metric}
              className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink-secondary"
            >
              {factor.description}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
