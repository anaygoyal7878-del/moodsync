"use client";

import { usePathname, useRouter } from "next/navigation";
import { Home, BarChart2, Zap, User, Sparkle } from "lucide-react";
import { MagnificationDock, type DockItemData } from "./MagnificationDock";
import { usePlatformPreview } from "@/components/dev/PlatformPreviewContext";

const TABS = [
  { href: "/dashboard", label: "Home", icon: Home, exact: true },
  { href: "/dashboard/meditation", label: "Meditate", icon: Sparkle, exact: false },
  { href: "/dashboard/insights", label: "Insights", icon: BarChart2, exact: false },
  { href: "/dashboard/automation", label: "Automations", icon: Zap, exact: false },
  { href: "/dashboard/profile", label: "Profile", icon: User, exact: false },
] as const;

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
      <MagnificationDock items={items} className="mx-auto" panelHeight={60} baseItemSize={44} magnification={64} distance={120} />
    </footer>
  );
}
