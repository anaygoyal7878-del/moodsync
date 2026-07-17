import type { HTMLAttributes } from "react";
import clsx from "clsx";

/** Deliberately unopinionated — callers compose width/height/shape via
 * className (e.g. "h-4 w-24", "h-10 w-10 rounded-full"). Replaces the
 * one-off inline skeleton previously local to dashboard/loading.tsx so
 * every section can have its own accurately-shaped loading state. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("animate-pulse rounded-md bg-surface-raised", className)} {...props} />;
}
