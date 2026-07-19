"use client";

import clsx from "clsx";

interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedControlOption<T>[];
  className?: string;
}

/** A labeled multi-way toggle (Low/Normal/High/Critical, 15min/30min/…)
 * for choosing between a small fixed set of named values, instead of a
 * bare number input the user has to guess the meaning of. */
export function SegmentedControl<T extends string>({ value, onChange, options, className }: SegmentedControlProps<T>) {
  return (
    <div className={clsx("inline-flex flex-wrap gap-1 rounded-full bg-surface-hover p-1", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={clsx(
            "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
            value === option.value ? "bg-brand text-ink" : "text-ink-secondary hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
