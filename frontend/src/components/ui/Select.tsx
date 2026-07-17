import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export function Select({ className, error = false, children, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select
        className={clsx(
          "w-full appearance-none rounded-xl border bg-surface px-4 py-2.5 pr-9 text-sm text-ink",
          "transition-colors focus:outline-none",
          error ? "border-danger focus:border-danger" : "border-line focus:border-line-strong",
          className,
        )}
        aria-invalid={error || undefined}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted"
        aria-hidden="true"
      />
    </div>
  );
}
