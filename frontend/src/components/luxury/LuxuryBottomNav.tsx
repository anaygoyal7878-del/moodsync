"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BarChart2, Zap, User } from "lucide-react";

const TABS = [
  { href: "/dashboard", label: "Home", icon: Home, exact: true },
  { href: "/dashboard/insights", label: "Insights", icon: BarChart2, exact: false },
  { href: "/dashboard/automation", label: "Automations", icon: Zap, exact: false },
  { href: "/dashboard/profile", label: "Profile", icon: User, exact: false },
] as const;

/** Ported from the Superdesign BottomTabNav component, with two
 * deliberate departures from the draft, both because the fifth tab and
 * center FAB were built for the Mood Check-In / Activities screens that
 * this port explicitly does not build (no MoodLog model, no meditation
 * feature — see the scoping conversation this port started from):
 * the raised center "+" FAB is dropped rather than repointed at an
 * unrelated action, and the unused "Activities" tab is replaced with
 * Automations, the closest real existing feature. */
export function LuxuryBottomNav() {
  const pathname = usePathname();

  return (
    <footer
      className="shrink-0 sticky bottom-0 z-40 pt-2 pb-[max(env(safe-area-inset-bottom),1rem)]"
      style={{ background: "var(--lux-bg-ground)", borderTop: "1px solid var(--lux-hairline)" }}
    >
      <div className="grid grid-cols-4 items-end px-2">
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          const color = active ? "var(--lux-sage)" : "var(--lux-muted)";
          const Icon = tab.icon;
          return (
            <Link key={tab.href} href={tab.href} className="flex flex-col items-center gap-1 py-2">
              <Icon size={20} style={{ color }} aria-hidden="true" />
              <span className="text-[10px] font-medium" style={{ color }}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </footer>
  );
}
