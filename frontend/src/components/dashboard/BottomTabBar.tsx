"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Sparkles, Zap, Cpu, TrendingUp, User } from "lucide-react";

/** A curated 6-item subset of Sidebar.tsx's full section list — a fixed
 * bottom tab bar (iOS-native convention) only has room for a handful of
 * glanceable destinations, unlike the desktop sidebar's full list.
 * "Scenes"/"Health"/"Profile" are named to match what a mobile-app user
 * would expect, but every href is a real existing page (no "Scenes" tab,
 * since a dedicated Scenes concept doesn't exist yet — this points at
 * Automations, the real equivalent). */
const TABS = [
  { href: "/dashboard", label: "Home", icon: Home, exact: true },
  { href: "/dashboard/wellness", label: "Health", icon: Sparkles },
  { href: "/dashboard/automation", label: "Automations", icon: Zap },
  { href: "/dashboard/devices", label: "Devices", icon: Cpu },
  { href: "/dashboard/insights", label: "Insights", icon: TrendingUp },
  { href: "/dashboard/profile", label: "Profile", icon: User },
] as const;

/** Mobile-only fixed bottom navigation (see Sidebar.tsx for the desktop
 * equivalent — layout.tsx renders both, breakpoints decide which shows).
 * `pb-[env(safe-area-inset-bottom)]` respects the iPhone home-indicator
 * area rather than sitting under it. */
export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Dashboard"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      {TABS.map((tab) => {
        const isActive = "exact" in tab && tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-transform active:scale-95"
          >
            <Icon
              size={22}
              aria-hidden="true"
              className={`transition-colors ${isActive ? "text-brand" : "text-ink-muted"}`}
              strokeWidth={isActive ? 2.25 : 2}
            />
            <span className={isActive ? "text-ink" : "text-ink-muted"}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
