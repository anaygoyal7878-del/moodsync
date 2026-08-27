"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { LogoutButton } from "@/components/marketing/LogoutButton";
import { NAV_GROUPS } from "@/lib/dashboardSections";
import { useViewMode } from "@/components/shell/ViewModeContext";

/** Persistent left-rail navigation for wide viewports — desktop-only
 * (see luxury/LuxuryTopNavBar.tsx + LuxuryBottomNav.tsx for the mobile
 * equivalent; DashboardShell.tsx renders both and CSS breakpoints
 * decide which one is actually visible, rather than one component
 * trying to be both shapes at once). Apple Health/Linear-style app
 * shell: always on screen, not summoned. Active-state is derived from
 * the real current route (usePathname), not a separately-tracked
 * selection. */
export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const { mode } = useViewMode();

  return (
    <nav
      aria-label="Dashboard"
      className={clsx(
        "shrink-0",
        mode === "mobile" && "hidden",
        mode === "web" && "flex h-screen w-56 flex-col gap-0.5 overflow-y-auto border-r border-line bg-surface px-3 py-6",
        mode === null &&
          "hidden sm:flex sm:h-screen sm:w-56 sm:flex-col sm:gap-0.5 sm:overflow-y-auto sm:border-r sm:border-line sm:bg-surface sm:px-3 sm:py-6",
      )}
    >
      <Link href="/dashboard" className="mb-4 flex items-center gap-2 px-2">
        <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
        <span className="text-[15px] font-semibold tracking-tight">MoodSync</span>
      </Link>

      {/* Three groups (see NAV_GROUPS) rather than five — fewer headings
          to read past before the eye lands on a link. The active row is
          marked with a sage rail rather than only a fill, so the current
          page is findable in one glance down the edge. */}
      <div className="flex flex-1 flex-col gap-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-px">
            <h2 className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{group.label}</h2>
            {group.items.map((section) => {
              const isActive =
                "exact" in section && section.exact ? pathname === section.href : pathname.startsWith(section.href);
              const Icon = section.icon;
              return (
                <Link
                  key={section.href}
                  href={section.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13.5px] font-medium transition-colors duration-150 ${
                    isActive ? "bg-surface-raised text-ink" : "text-ink-secondary hover:bg-surface-hover hover:text-ink"
                  }`}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-full"
                      style={{ background: "var(--brand)" }}
                    />
                  )}
                  <Icon size={16} aria-hidden="true" className={isActive ? "text-brand" : "opacity-80"} />
                  <span>{section.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-line px-2 pt-4">
        <span className="truncate text-xs text-ink-muted">{email}</span>
        <LogoutButton />
      </div>
    </nav>
  );
}
