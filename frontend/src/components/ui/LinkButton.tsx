import type { AnchorHTMLAttributes } from "react";
import clsx from "clsx";

interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: "primary" | "secondary" | "ghost";
}

/** Same visual language as Button, for actions that must be a real
 * navigation (e.g. starting an OAuth redirect) rather than a fetch — a
 * top-level browser navigation is required to carry the provider's own
 * consent-screen redirect, so this can't be a JS click handler. */
export function LinkButton({ variant = "secondary", className, ...props }: LinkButtonProps) {
  return (
    <a
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.98]",
        variant === "primary" && "bg-brand text-canvas hover:bg-brand-hover",
        variant === "secondary" && "bg-surface-raised text-ink border border-line-strong hover:bg-surface-hover",
        variant === "ghost" && "text-ink-secondary hover:text-ink hover:bg-surface-hover",
        className,
      )}
      {...props}
    />
  );
}
