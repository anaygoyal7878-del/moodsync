import { Sidebar } from "@/components/dashboard/Sidebar";
import { LuxuryTopNavBar } from "@/components/luxury/LuxuryTopNavBar";
import { LuxuryBottomNav } from "@/components/luxury/LuxuryBottomNav";
import { DashboardShellFrame } from "@/components/dashboard/DashboardShellFrame";

/** The single app shell for every /dashboard/* route. Two nav
 * components split by viewport, not by route — Sidebar.tsx (desktop)
 * and LuxuryTopNavBar/LuxuryBottomNav (mobile) — mirroring the
 * "laptop" vs "app style" split the whole dashboard is meant to
 * support. Which one is actually visible is normally decided by the
 * `sm:` CSS breakpoint (real viewport width); DashboardShellFrame adds
 * a dev-only override on top of that for previewing both without
 * resizing the window (see lib/platformPreview.ts) — this file stays a
 * server component either way, since the override logic lives entirely
 * in DashboardShellFrame's client boundary. The dark palette itself
 * comes from wrapping everything in `.ms-luxury` (see globals.css):
 * that class repoints the app's existing --surface/--ink/--brand/etc.
 * tokens to the dark-luxury values, so Sidebar and every pre-existing
 * dashboard component (AutomationSection, ConnectionsSection,
 * DeviceCard, the recharts-based TrendChart/Sparkline, …) re-themes
 * automatically with no per-component edits. */
export function DashboardShell({
  email,
  displayName,
  children,
}: {
  email: string;
  displayName: string | null;
  children: React.ReactNode;
}) {
  const name = displayName ?? email.split("@")[0];

  return (
    <DashboardShellFrame
      sidebar={<Sidebar email={email} />}
      topNav={<LuxuryTopNavBar userName={name} />}
      bottomNav={<LuxuryBottomNav />}
    >
      {children}
    </DashboardShellFrame>
  );
}
