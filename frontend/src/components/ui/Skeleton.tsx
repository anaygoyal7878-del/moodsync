import type { HTMLAttributes } from "react";
import clsx from "clsx";

/** Deliberately unopinionated on shape — no default radius, since a
 * className like "rounded-full" or "rounded-2xl" from the caller would
 * otherwise sit in the class list alongside a hardcoded default and
 * leave the winner up to Tailwind's generated-CSS order rather than
 * anything explicit. Callers compose width/height/radius entirely via
 * className (e.g. "h-4 w-24 rounded", "h-10 w-10 rounded-full").
 * Replaces the one-off inline skeleton previously local to
 * dashboard/loading.tsx so every section can have its own
 * accurately-shaped loading state. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("animate-pulse bg-surface-raised", className)} {...props} />;
}
