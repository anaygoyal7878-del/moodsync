import { BatteryFull, BatteryMedium, BatteryLow, BatteryWarning, Plug } from 'lucide-react';
import clsx from 'clsx';

export function BatteryIndicator({ battery, isPluggedIn }: { battery: number | null; isPluggedIn: boolean }) {
  if (battery === null || isPluggedIn) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-ink-secondary">
        <Plug className="h-3.5 w-3.5" aria-hidden="true" />
        Plugged in
      </span>
    );
  }

  const Icon = battery >= 75 ? BatteryFull : battery >= 40 ? BatteryMedium : battery >= 15 ? BatteryLow : BatteryWarning;
  const colorClass = battery >= 40 ? 'text-state-recover' : battery >= 15 ? 'text-state-energize' : 'text-red-400';

  return (
    <span className={clsx('inline-flex items-center gap-1 text-xs font-medium tabular-nums', colorClass)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {battery}%
    </span>
  );
}
