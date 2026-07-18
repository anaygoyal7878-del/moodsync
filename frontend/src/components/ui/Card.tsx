import type { HTMLAttributes } from "react";
import clsx from "clsx";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  raised?: boolean;
  /** "glass" applies the frosted, layered-material treatment
   * (.glass-panel in globals.css) — reserved for surfaces that want to
   * feel elevated above the page itself (hero panels, the active step
   * of a walkthrough), not the default for every card, so the effect
   * stays a genuine accent rather than the whole app looking translucent. */
  variant?: "flat" | "raised" | "glass";
}

export function Card({ className, raised = false, variant, ...props }: CardProps) {
  const resolvedVariant = variant ?? (raised ? "raised" : "flat");
  return (
    <div
      className={clsx(
        "rounded-2xl border border-line p-6",
        resolvedVariant === "glass" && "glass-panel border-line-strong",
        resolvedVariant === "raised" && "bg-surface-raised shadow-[var(--shadow-sm)]",
        resolvedVariant === "flat" && "bg-surface",
        className,
      )}
      {...props}
    />
  );
}
