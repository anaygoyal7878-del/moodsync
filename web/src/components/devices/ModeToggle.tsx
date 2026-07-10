import clsx from 'clsx';
import type { DeviceMode } from '../../types/device';

export function ModeToggle({ mode, onChange }: { mode: DeviceMode; onChange: (mode: DeviceMode) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Automation mode"
      className="inline-flex items-center rounded-full border border-line bg-surface p-0.5 text-xs font-medium"
    >
      {(['auto', 'manual'] as const).map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={mode === option}
          onClick={() => onChange(option)}
          className={clsx(
            'rounded-full px-3 py-1 capitalize transition-colors',
            mode === option ? 'bg-brand text-canvas' : 'text-ink-secondary hover:text-ink',
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
