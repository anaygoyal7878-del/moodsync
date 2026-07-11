import type { HTMLAttributes } from "react";
import clsx from "clsx";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  raised?: boolean;
}

export function Card({ className, raised = false, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-line p-6",
        raised ? "bg-surface-raised shadow-[0_1px_2px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.04)]" : "bg-surface",
        className,
      )}
      {...props}
    />
  );
}
