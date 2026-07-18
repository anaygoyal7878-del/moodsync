"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Link2, Activity, Sparkles, Zap, Bell, TrendingUp, Cpu, Wand2, CalendarClock } from "lucide-react";
import { LogoutButton } from "@/components/marketing/LogoutButton";

const SECTIONS = [
  { href: "/dashboard", label: "Home", icon: Home, exact: true },
  { href: "/dashboard/wellness", label: "Wellness", icon: Sparkles },
  { href: "/dashboard/biometrics", label: "Biometrics", icon: Activity },
  { href: "/dashboard/automation", label: "Automations", icon: Zap },
  { href: "/dashboard/recommendations", label: "Recommendations", icon: Wand2 },
  { href: "/dashboard/insights", label: "Insights", icon: TrendingUp },
  { href: "/dashboard/devices", label: "Devices", icon: Cpu },
  { href: "/dashboard/connections", label: "Connections", icon: Link2 },
  { href: "/dashboard/weekly-report", label: "Weekly report", icon: CalendarClock },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
] as const;

/** Persistent left-rail navigation — replaces the previous floating
 * bottom Dock. Fixed on desktop (Apple Health/Linear-style app shell,
 * always visible rather than summoned); collapses to a horizontal icon
 * strip on narrow viewports, since a fixed sidebar doesn't fit a phone
 * screen the same way. Active-state is derived from the real current
 * route (usePathname), not a separately-tracked selection. */
export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Dashboard"
      className="flex shrink-0 flex-row items-center gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2 sm:h-screen sm:w-56 sm:flex-col sm:items-stretch sm:gap-0.5 sm:overflow-x-visible sm:overflow-y-auto sm:border-b-0 sm:border-r sm:px-3 sm:py-6"
    >
      <Link href="/dashboard" className="mb-4 hidden items-center gap-2 px-2 sm:flex">
        <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
        <span className="text-[15px] font-semibold tracking-tight">MoodSync</span>
      </Link>

      <div className="flex flex-1 flex-row gap-1 sm:flex-col sm:gap-0.5">
        {SECTIONS.map((section) => {
          const isActive = "exact" in section && section.exact ? pathname === section.href : pathname.startsWith(section.href);
          const Icon = section.icon;
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? "bg-surface-raised text-ink" : "text-ink-secondary hover:bg-surface-hover hover:text-ink"
              }`}
            >
              <Icon size={17} aria-hidden="true" className={isActive ? "text-brand" : ""} />
              <span className="hidden sm:inline">{section.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-4 hidden flex-col gap-2 border-t border-line px-2 pt-4 sm:flex">
        <span className="truncate text-xs text-ink-muted">{email}</span>
        <LogoutButton />
      </div>
    </nav>
  );
}
