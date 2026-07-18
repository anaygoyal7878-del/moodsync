"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BarChart2, Zap, User, Sparkle } from "lucide-react";

const SIDE_TABS = [
  { href: "/dashboard", label: "Home", icon: Home, exact: true },
  { href: "/dashboard/insights", label: "Insights", icon: BarChart2, exact: false },
] as const;

const TRAILING_TABS = [
  { href: "/dashboard/automation", label: "Automations", icon: Zap, exact: false },
  { href: "/dashboard/profile", label: "Profile", icon: User, exact: false },
] as const;

/** Ported from the Superdesign BottomTabNav component. Mobile-only
 * (sm:hidden — Sidebar.tsx covers desktop). One deliberate departure
 * from the draft: the raised center FAB was originally a Mood Check-In
 * shortcut, a feature this port doesn't build (no MoodLog model exists)
 * — it's repointed at the real Meditation Session page instead. The
 * draft's unused fifth "Activities" tab is dropped in favor of a
 * 2-2-FAB layout, since Automations already covers that role. */
export function LuxuryBottomNav() {
  const pathname = usePathname();
  const isMeditating = pathname.startsWith("/dashboard/meditation");

  return (
    <footer
      className="shrink-0 sticky bottom-0 z-40 pt-2 pb-[max(env(safe-area-inset-bottom),1rem)] sm:hidden"
      style={{ background: "var(--lux-bg-ground)", borderTop: "1px solid var(--lux-hairline)" }}
    >
      <div className="grid grid-cols-5 items-end px-2">
        {SIDE_TABS.map((tab) => {
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

        <div className="-mt-7 flex flex-col items-center justify-start">
          <Link
            href="/dashboard/meditation"
            aria-label="Meditate"
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{
              background: "var(--lux-sage)",
              border: "3px solid var(--lux-bg-ground)",
              boxShadow: "0 8px 24px rgba(95,184,120,0.35), 0 2px 8px rgba(0,0,0,0.4)",
            }}
          >
            <Sparkle size={22} style={{ color: "#1a241e" }} aria-hidden="true" />
          </Link>
        </div>

        {TRAILING_TABS.map((tab) => {
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
      {isMeditating && (
        <p className="pb-1 text-center text-[10px] font-medium" style={{ color: "var(--lux-sage)" }}>
          Meditate
        </p>
      )}
    </footer>
  );
}
