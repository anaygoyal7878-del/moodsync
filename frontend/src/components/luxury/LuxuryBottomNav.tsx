"use client";

import { usePathname, useRouter } from "next/navigation";
import { Home, BarChart2, Zap, User, Sparkle, Bot } from "lucide-react";
import { MagnificationDock, type DockItemData } from "./MagnificationDock";
import { usePlatformPreview } from "@/components/dev/PlatformPreviewContext";

/** Exported so LuxuryProfile.tsx can list *everything this bar doesn't*
 * without the two drifting apart — a fixed bottom bar only fits ~6
 * items, but every page in DASHBOARD_SECTIONS still has to be reachable
 * on mobile, and the Sidebar that covers the rest on desktop is
 * `hidden` below the `sm:` breakpoint. */
export const BOTTOM_NAV_TABS = [
  { href: "/dashboard", label: "Home", icon: Home, exact: true },
  { href: "/dashboard/atlas", label: "Atlas", icon: Bot, exact: false },
  { href: "/dashboard/meditation", label: "Meditate", icon: Sparkle, exact: false },
  { href: "/dashboard/insights", label: "Insights", icon: BarChart2, exact: false },
  { href: "/dashboard/automation", label: "Automations", icon: Zap, exact: false },
  { href: "/dashboard/profile", label: "Profile", icon: User, exact: false },
] as const;

const TABS = BOTTOM_NAV_TABS;

/** Mobile-only bottom navigation (Sidebar.tsx covers desktop). Built on
 * MagnificationDock — see that file's doc comment for provenance —
 * ported into a real nav (each item routes via `router.push`, not the
 * reference's `alert()` demo callbacks) instead of a decorative
 * showcase. `platform-preview` support (mode/`sm:hidden` swap) is a
 * dev-only addition — see lib/platformPreview.ts. */
export function LuxuryBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { mode } = usePlatformPreview();

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
