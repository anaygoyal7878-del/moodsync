"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import {
  DEV_PLATFORM_PREVIEW_ENABLED,
  PLATFORM_PREVIEW_STORAGE_KEY,
  type PlatformPreviewMode,
} from "@/lib/platformPreview";

interface PlatformPreviewContextValue {
  mode: PlatformPreviewMode;
  setMode: (mode: PlatformPreviewMode) => void;
}

const PlatformPreviewContext = createContext<PlatformPreviewContextValue>({
  mode: null,
  setMode: () => {},
});

// A tiny local pub-sub, not cross-tab `storage` events — this control
// only needs to notify the current tab's own React tree when `setMode`
// writes a new value, which `useSyncExternalStore` needs a subscribe
// function for.
const listeners = new Set<() => void>();
function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
function notify(): void {
  for (const listener of listeners) listener();
}

function getSnapshot(): PlatformPreviewMode {
  if (!DEV_PLATFORM_PREVIEW_ENABLED) return null;
  const stored = window.localStorage.getItem(PLATFORM_PREVIEW_STORAGE_KEY);
  return stored === "mobile" || stored === "web" ? stored : null;
}

// The server has no localStorage — always renders the real-viewport
// default, matching the client's first paint before hydration reads
// the real stored value (useSyncExternalStore's designed-for case,
// unlike a `useEffect`+`setState` reproduction of the same thing).
function getServerSnapshot(): PlatformPreviewMode {
  return null;
}

/** Dev-only shell-layout override — see lib/platformPreview.ts. Wraps
 * the dashboard shell so nav components (Sidebar, LuxuryTopNavBar,
 * LuxuryBottomNav) can read the forced mode via `usePlatformPreview()`
 * instead of relying purely on the `sm:` CSS breakpoint. */
export function PlatformPreviewProvider({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function setMode(next: PlatformPreviewMode) {
    if (!DEV_PLATFORM_PREVIEW_ENABLED) return;
    if (next) window.localStorage.setItem(PLATFORM_PREVIEW_STORAGE_KEY, next);
    else window.localStorage.removeItem(PLATFORM_PREVIEW_STORAGE_KEY);
    notify();
  }

  return <PlatformPreviewContext.Provider value={{ mode, setMode }}>{children}</PlatformPreviewContext.Provider>;
}

export function usePlatformPreview(): PlatformPreviewContextValue {
  return useContext(PlatformPreviewContext);
}
