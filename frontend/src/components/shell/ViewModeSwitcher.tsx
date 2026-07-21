"use client";

import clsx from "clsx";
import { useViewMode } from "./ViewModeContext";

/** Slim, always-visible bar for forcing the dashboard shell into
 * "Mobile App" or "Web Dashboard" layout regardless of the real
 * viewport width — a permanent feature (not a dev tool) so a reviewer
 * on desktop can see the phone experience from the same published
 * link, without resizing their window. See lib/viewMode.ts's doc
 * comment.
 *
 * Renders in normal document flow at the very top of the shell (see
 * DashboardShellFrame.tsx), not as a floating overlay — an earlier
 * fixed-position pill centered over the top nav visibly overlapped the
 * greeting text on narrow viewports. Sitting in-flow means every
 * element below it is pushed down instead, which costs one row of
 * height but can never overlap anything. */
export function ViewModeSwitcher() {
  const { mode, setMode } = useViewMode();

  return (
    <div
      className="sticky top-0 z-[100] flex items-center justify-center gap-1 border-b px-2 py-1.5 text-xs"
      style={{
        background: "rgba(20, 16, 24, 0.97)",
        borderColor: "rgba(255,255,255,0.1)",
      }}
    >
      <button
        type="button"
        onClick={() => setMode(mode === "mobile" ? null : "mobile")}
        aria-pressed={mode === "mobile"}
        className={clsx(
          "rounded-full px-3 py-1 font-medium transition-colors",
          mode === "mobile" ? "bg-white text-black" : "text-white/70 hover:text-white",
        )}
      >
        📱 Mobile App
      </button>
      <button
        type="button"
        onClick={() => setMode(mode === "web" ? null : "web")}
        aria-pressed={mode === "web"}
        className={clsx(
          "rounded-full px-3 py-1 font-medium transition-colors",
          mode === "web" ? "bg-white text-black" : "text-white/70 hover:text-white",
        )}
      >
        🖥️ Web Dashboard
      </button>
      {mode && (
        <button
          type="button"
          onClick={() => setMode(null)}
          className="rounded-full px-2 py-1 text-white/40 hover:text-white/70"
          aria-label="Clear layout override, follow real viewport"
        >
          ×
        </button>
      )}
    </div>
  );
}
