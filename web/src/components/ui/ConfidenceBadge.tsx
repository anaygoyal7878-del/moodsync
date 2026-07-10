import clsx from 'clsx';
import type { ConfidenceLevel } from '../../types/domain';

const labels: Record<ConfidenceLevel, string> = {
  high: 'High confidence',
  moderate: 'Moderate confidence',
  low: 'Low confidence',
  insufficient: 'Insufficient evidence',
};

const styles: Record<ConfidenceLevel, string> = {
  high: 'bg-state-recover/15 text-state-recover',
  moderate: 'bg-state-focus/15 text-state-focus',
  low: 'bg-state-energize/15 text-state-energize',
  insufficient: 'bg-ink-muted/15 text-ink-secondary',
};

export function ConfidenceBadge({ level, className }: { level: ConfidenceLevel; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        styles[level],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {labels[level]}
    </span>
  );
}
