import type { InputHTMLAttributes } from "react";
import clsx from "clsx";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  errorMessage?: string;
}

export function Input({ className, error = false, errorMessage, id, ...props }: InputProps) {
  const input = (
    <input
      id={id}
      className={clsx(
        "w-full rounded-xl border bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-muted",
        "transition-colors focus:outline-none",
        error ? "border-danger focus:border-danger" : "border-line focus:border-line-strong",
        className,
      )}
      aria-invalid={error || undefined}
      {...props}
    />
  );

  if (!errorMessage) return input;

  return (
    <div className="flex flex-col gap-1">
      {input}
      <p className="text-xs text-danger">{errorMessage}</p>
    </div>
  );
}
