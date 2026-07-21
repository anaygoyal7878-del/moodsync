"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { VIEW_MODE_STORAGE_KEY, type ViewMode } from "@/lib/viewMode";

interface ViewModeContextValue {
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
}

const ViewModeContext = createContext<ViewModeContextValue>({
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

function getSnapshot(): ViewMode {
  const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return stored === "mobile" || stored === "web" ? stored : null;
}

// The server has no localStorage — always renders the real-viewport
// default, matching the client's first paint before hydration reads
// the real stored value (useSyncExternalStore's designed-for case,
// unlike a `useEffect`+`setState` reproduction of the same thing).
function getServerSnapshot(): ViewMode {
  return null;
}

/** Shell-layout override — see lib/viewMode.ts. Wraps the dashboard
 * shell so nav components (Sidebar, LuxuryTopNavBar, LuxuryBottomNav)
 * can read the forced mode via `useViewMode()` instead of relying
 * purely on the `sm:` CSS breakpoint. */
export function ViewModeProvider({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function setMode(next: ViewMode) {
    if (next) window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, next);
    else window.localStorage.removeItem(VIEW_MODE_STORAGE_KEY);
    notify();
  }

  return <ViewModeContext.Provider value={{ mode, setMode }}>{children}</ViewModeContext.Provider>;
}

export function useViewMode(): ViewModeContextValue {
  return useContext(ViewModeContext);
}
