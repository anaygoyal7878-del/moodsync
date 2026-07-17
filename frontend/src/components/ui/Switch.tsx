import clsx from "clsx";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

/** A single accessible `<button role="switch">` containing both the
 * track/thumb visual and (optionally) the label text, rather than a
 * wrapped native checkbox or a separate `<label>` — a `<label>` wrapping
 * a non-form-associated button doesn't reliably delegate clicks the way
 * it does for native inputs, so the whole thing is one clickable target
 * instead. */
export function Switch({ checked, onCheckedChange, disabled = false, label, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={clsx(
        "inline-flex items-center gap-2.5 text-sm text-ink-secondary",
        "disabled:opacity-40 disabled:pointer-events-none",
        className,
      )}
    >
      <span
        className={clsx(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-brand" : "bg-surface-hover",
        )}
        aria-hidden="true"
      >
        <span
          className={clsx(
            "inline-block h-4 w-4 transform rounded-full bg-ink transition-transform",
            checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      </span>
      {label}
    </button>
  );
}
