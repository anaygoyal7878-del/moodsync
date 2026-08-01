"use client";

import { usePathname, useRouter } from "next/navigation";
import { Home, Disc3, Timer, Moon, User, Bot } from "lucide-react";
import { MagnificationDock, type DockItemData } from "./MagnificationDock";
import { useViewMode } from "@/components/shell/ViewModeContext";

/**
 * The mobile companion's six tabs — deliberately *not* the same shape as
 * the desktop sidebar. Phone use is daily and one-handed, so these are
 * the five things a person actually opens the app to do plus the
 * overflow: how am I doing (Today), put something on (Music), get to
 * work (Focus), close the day (Sleep), ask something (Atlas).
 *
 * Music is a primary tab because the listening journey — press play,
 * watch your body respond, learn what works — is a flagship feature,
 * not a utility. It routes to the Music hub rather than straight to the
 * player: the hub is where you *start* something, and the player is one
 * tap from there. Landing on a player with nothing playing would be a
 * dead end.
 *
 * Energy lost its slot to Music. It stays one tap away — the Today
 * hero shows the live energy meter and links straight through — and is
 * listed in Settings' overflow below.
 *
 * Automations, Devices and Scenes deliberately do NOT appear here —
 * configuring a smart home is control-center work that belongs on the
 * web app, and they stay reachable on mobile through Settings'
 * overflow list below.
 *
 * Exported so LuxuryProfile.tsx can list *everything this bar doesn't*
 * without the two drifting apart — every page in DASHBOARD_SECTIONS has
 * to stay reachable on mobile, and the Sidebar that covers the rest on
 * desktop is `hidden` below the `sm:` breakpoint.
 */
export const BOTTOM_NAV_TABS = [
  { href: "/dashboard", label: "Today", icon: Home, exact: true },
  { href: "/dashboard/music", label: "Music", icon: Disc3, exact: false },
  { href: "/dashboard/focus", label: "Focus", icon: Timer, exact: false },
  { href: "/dashboard/sleep", label: "Sleep", icon: Moon, exact: false },
  { href: "/dashboard/atlas", label: "Atlas", icon: Bot, exact: false },
  { href: "/dashboard/profile", label: "More", icon: User, exact: false },
] as const;

const TABS = BOTTOM_NAV_TABS;

/** Mobile-only bottom navigation (Sidebar.tsx covers desktop). Built on
 * MagnificationDock — see that file's doc comment for provenance —
 * ported into a real nav (each item routes via `router.push`, not the
 * reference's `alert()` demo callbacks) instead of a decorative
 * showcase. Honors the view-mode override (mode/`sm:hidden` swap) — see
 * lib/viewMode.ts. */
export function LuxuryBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { mode } = useViewMode();

  const visibilityClass = mode === "mobile" ? "block" : mode === "web" ? "hidden" : "sm:hidden";

  const items: DockItemData[] = TABS.map((tab) => {
    const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
    const Icon = tab.icon;
    return {
      icon: <Icon size={20} aria-hidden="true" />,
      label: tab.label,
      onClick: () => router.push(tab.href),
      active,
    };
  });

  return (
    <footer
      className={`shrink-0 sticky bottom-0 z-40 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] ${visibilityClass}`}
      style={{ background: "var(--lux-bg-ground)" }}
    >
      <MagnificationDock items={items} className="mx-auto" panelHeight={58} baseItemSize={40} magnification={58} distance={100} />
    </footer>
  );
}
