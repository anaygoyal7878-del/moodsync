import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
}

export function Button({ variant = "secondary", className, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none",
        variant === "primary" && "bg-brand text-canvas hover:bg-brand-hover",
        variant === "secondary" && "bg-surface-raised text-ink border border-line-strong hover:bg-surface-hover",
        variant === "ghost" && "text-ink-secondary hover:text-ink hover:bg-surface-hover",
        className,
      )}
      {...props}
    />
  );
}
