"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

/** One named, independently collapsible region of the automation
 * builder (Trigger / Conditions / Actions / Notifications / Advanced) —
 * cuts visual clutter on a form with this many controls by letting the
 * user fold away sections they've already set up. Uncontrolled
 * (`defaultOpen` only) since nothing outside this component needs to
 * know a given section's open state. */
export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = true,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-line bg-surface-raised/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
        </div>
        <ChevronDown
          size={16}
          className={clsx("shrink-0 text-ink-muted transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open && <div className="flex flex-col gap-4 border-t border-line px-4 pt-4 pb-5">{children}</div>}
    </div>
  );
}
