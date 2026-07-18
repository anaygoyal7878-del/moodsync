"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/marketing/LogoutButton";
import { DASHBOARD_SECTIONS as SECTIONS } from "@/lib/dashboardSections";

/** Persistent left-rail navigation for wide viewports — desktop-only
 * (see BottomTabBar.tsx for the mobile equivalent; layout.tsx renders
 * both and CSS breakpoints decide which one is actually visible, rather
 * than one component trying to be both shapes at once). Apple Health/
 * Linear-style app shell: always on screen, not summoned. Active-state
 * is derived from the real current route (usePathname), not a
 * separately-tracked selection. */
export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Dashboard"
      className="hidden shrink-0 sm:flex sm:h-screen sm:w-56 sm:flex-col sm:gap-0.5 sm:overflow-y-auto sm:border-r sm:border-line sm:bg-surface sm:px-3 sm:py-6"
    >
      <Link href="/dashboard" className="mb-4 flex items-center gap-2 px-2">
        <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
        <span className="text-[15px] font-semibold tracking-tight">MoodSync</span>
      </Link>

      <div className="flex flex-1 flex-col gap-0.5">
        {SECTIONS.map((section) => {
          const isActive = "exact" in section && section.exact ? pathname === section.href : pathname.startsWith(section.href);
          const Icon = section.icon;
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? "bg-surface-raised text-ink" : "text-ink-secondary hover:bg-surface-hover hover:text-ink"
              }`}
            >
              <Icon size={17} aria-hidden="true" className={isActive ? "text-brand" : ""} />
              <span>{section.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-line px-2 pt-4">
        <span className="truncate text-xs text-ink-muted">{email}</span>
        <LogoutButton />
      </div>
    </nav>
  );
}
