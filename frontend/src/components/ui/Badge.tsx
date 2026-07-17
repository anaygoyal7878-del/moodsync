import type { HTMLAttributes } from "react";
import clsx from "clsx";

type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral" | "brand";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  neutral: "bg-surface-raised text-ink-muted",
  brand: "bg-brand/15 text-brand",
};

const DOT_CLASSES: Record<BadgeVariant, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-ink-muted",
  brand: "bg-brand",
};

export function Badge({ variant = "neutral", dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    >
      {dot && <span className={clsx("h-1.5 w-1.5 rounded-full", DOT_CLASSES[variant])} aria-hidden="true" />}
      {children}
    </span>
  );
}
