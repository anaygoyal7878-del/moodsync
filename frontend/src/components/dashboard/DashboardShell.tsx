"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { LuxuryTopNavBar } from "@/components/luxury/LuxuryTopNavBar";
import { LuxuryBottomNav } from "@/components/luxury/LuxuryBottomNav";

const LUXURY_ROUTES = ["/dashboard", "/dashboard/insights", "/dashboard/profile"];

/** Two navigation systems live side by side during the Superdesign
 * rollout: the original earthy-palette Sidebar/BottomTabBar (every
 * route) and the ported dark-luxury TopNavBar/BottomNav (Home/Insights/
 * Profile only — the 3 pages that got a Superdesign-sourced restyle;
 * see the scoping conversation this port started from for why Devices/
 * Automations/etc. weren't included). Picking the shell by exact-set
 * pathname match here, rather than moving these 3 pages into a
 * sibling route group, keeps every route under the same
 * dashboard/layout.tsx auth gate and avoids duplicating that gate. */
export function DashboardShell({
  email,
  displayName,
  children,
}: {
  email: string;
  displayName: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLuxury = LUXURY_ROUTES.includes(pathname);

  if (isLuxury) {
    const name = displayName ?? email.split("@")[0];
    return (
      <div className="ms-luxury flex min-h-screen w-full flex-1 flex-col">
        <LuxuryTopNavBar userName={name} />
        <main className="relative flex-1 overflow-y-auto overflow-x-hidden px-5 pt-5 pb-6">{children}</main>
        <LuxuryBottomNav />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col sm:flex-row">
      <Sidebar email={email} />
      <main className="flex-1 overflow-x-hidden px-4 py-8 pb-24 sm:px-8 sm:py-10 sm:pb-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-8">{children}</div>
      </main>
      <BottomTabBar />
    </div>
  );
}
