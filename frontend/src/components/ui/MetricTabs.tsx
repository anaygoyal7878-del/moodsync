"use client";

import { useCallback, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/**
 * A segmented control that shows one panel at a time.
 *
 * Exists because the Home page stacked Heart, Sleep and Activity one
 * under another: measured at phone width that was 2,298px — 60% of the
 * whole page — before the user reached anything below. Each section is
 * still there; you choose which one you're looking at instead of
 * scrolling past the other two.
 *
 * Panels are passed in as rendered nodes, so the page that owns them can
 * stay a server component and the charts inside are unchanged.
 *
 * ## Motion
 *
 * Switching crossfades with a short rise, ~220ms. Long enough to read as
 * one surface changing rather than a hard cut, short enough that it
 * never makes someone wait. The active indicator slides rather than
 * jumping, which is what makes a segmented control feel physical.
 *
 * Under `prefers-reduced-motion` both collapse to an instant change —
 * handled in CSS (`.metric-tab-panel` / `.metric-tab-indicator`) so it
 * applies before hydration, not after a flash of animation.
 *
 * Inactive panels are unmounted rather than hidden. That is the point:
 * a hidden panel still runs its charts' layout and animation, so hiding
 * would shorten the page without making it any cheaper to render.
 */

export interface MetricTab {
  id: string;
  label: string;
  content: ReactNode;
}

export function MetricTabs({ tabs, ariaLabel }: { tabs: MetricTab[]; ariaLabel: string }) {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const select = useCallback((index: number) => {
    setActive(index);
    buttons.current[index]?.focus();
  }, []);

  // Arrow keys move between tabs, matching the WAI-ARIA tabs pattern —
  // Tab itself moves out of the control rather than through every tab.
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (tabs.length < 2) return;
      if (event.key === "ArrowRight") select((active + 1) % tabs.length);
      else if (event.key === "ArrowLeft") select((active - 1 + tabs.length) % tabs.length);
      else if (event.key === "Home") select(0);
      else if (event.key === "End") select(tabs.length - 1);
      else return;
      event.preventDefault();
    },
    [active, select, tabs.length],
  );

  if (tabs.length === 0) return null;
  // A single panel needs no control; rendering one lone segment would be
  // a button that does nothing.
  if (tabs.length === 1) return <>{tabs[0]!.content}</>;

  const current = tabs[Math.min(active, tabs.length - 1)]!;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        className="relative grid rounded-full p-1"
        style={{
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
          background: "var(--lux-bg-card)",
          border: "1px solid var(--lux-hairline)",
          boxShadow: "var(--elev-3)",
        }}
      >
        {/* The sliding indicator. Positioned by percentage so it needs no
            measurement — the columns are equal width by construction. */}
        <span
          aria-hidden="true"
          className="metric-tab-indicator pointer-events-none absolute top-1 bottom-1 rounded-full"
          style={{
            left: `calc(${(100 / tabs.length) * active}% + 4px)`,
            width: `calc(${100 / tabs.length}% - 8px)`,
            background: "var(--lux-bg-card-2)",
            border: "1px solid var(--lux-hairline-gold)",
            boxShadow: "var(--elev-gold)",
          }}
        />
        {tabs.map((tab, index) => {
          const selected = index === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                buttons.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(index)}
              className="relative z-10 rounded-full px-3 py-2 text-[13px] font-medium transition-colors duration-200"
              style={{ color: selected ? "var(--gold)" : "var(--lux-muted)" }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Keyed on the tab so React remounts it, which is what restarts
          the entry animation on every switch. */}
      <div
        key={current.id}
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${current.id}`}
        className="metric-tab-panel"
      >
        {current.content}
      </div>
    </div>
  );
}
