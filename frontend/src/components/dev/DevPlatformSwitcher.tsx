"use client";

import clsx from "clsx";
import { DEV_PLATFORM_PREVIEW_ENABLED } from "@/lib/platformPreview";
import { usePlatformPreview } from "./PlatformPreviewContext";

/** Floating dev-only control for forcing the dashboard shell into
 * "Mobile App" or "Web Dashboard" layout regardless of real viewport
 * width — see lib/platformPreview.ts's doc comment for why this is
 * intentionally temporary/removable. Renders nothing at all outside
 * development (both here and in the provider), so there's no risk of
 * this reaching real users even if the import is left in place. */
export function DevPlatformSwitcher() {
  if (!DEV_PLATFORM_PREVIEW_ENABLED) return null;
  return <DevPlatformSwitcherInner />;
}

function DevPlatformSwitcherInner() {
  const { mode, setMode } = usePlatformPreview();

  return (
    <div
      className="fixed top-3 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full border p-1 text-xs shadow-lg backdrop-blur-md"
      style={{
        background: "rgba(20, 16, 24, 0.92)",
        borderColor: "rgba(255,255,255,0.14)",
      }}
    >
      <span className="hidden pl-2 pr-1 font-medium tracking-wide text-white/40 sm:inline">DEV PREVIEW</span>
      <button
        type="button"
        onClick={() => setMode(mode === "mobile" ? null : "mobile")}
        aria-pressed={mode === "mobile"}
        className={clsx(
          "rounded-full px-3 py-1.5 font-medium transition-colors",
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
          "rounded-full px-3 py-1.5 font-medium transition-colors",
          mode === "web" ? "bg-white text-black" : "text-white/70 hover:text-white",
        )}
      >
        🖥️ Web Dashboard
      </button>
      {mode && (
        <button
          type="button"
          onClick={() => setMode(null)}
          className="rounded-full px-2.5 py-1.5 text-white/40 hover:text-white/70"
          aria-label="Clear preview override, follow real viewport"
        >
          ×
        </button>
      )}
    </div>
  );
}
