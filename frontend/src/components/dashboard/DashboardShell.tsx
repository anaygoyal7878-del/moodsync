import { Sidebar } from "@/components/dashboard/Sidebar";
import { LuxuryTopNavBar } from "@/components/luxury/LuxuryTopNavBar";
import { LuxuryBottomNav } from "@/components/luxury/LuxuryBottomNav";

/** The single app shell for every /dashboard/* route. Two nav
 * components split by viewport, not by route — Sidebar.tsx (desktop,
 * `hidden sm:flex`) and LuxuryTopNavBar/LuxuryBottomNav (mobile,
 * `sm:hidden`) — mirroring the "laptop" vs "app style" split the whole
 * dashboard is meant to support. The dark palette itself comes from
 * wrapping everything in `.ms-luxury` (see globals.css): that class
 * repoints the app's existing --surface/--ink/--brand/etc. tokens to
 * the dark-luxury values, so Sidebar and every pre-existing dashboard
 * component (AutomationSection, ConnectionsSection, DeviceCard, the
 * recharts-based TrendChart/Sparkline, …) re-themes automatically with
 * no per-component edits — this replaced an earlier version of this
 * component that branched between two entirely separate designs by
 * exact pathname. */
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
    <div className="ms-luxury flex min-h-screen w-full flex-1 flex-col sm:flex-row">
      <Sidebar email={email} />
      <div className="flex min-h-screen flex-1 flex-col sm:h-screen sm:overflow-y-auto">
        <LuxuryTopNavBar userName={name} />
        <main className="relative flex-1 overflow-x-hidden px-5 pt-5 pb-6 sm:mx-auto sm:w-full sm:max-w-3xl sm:px-8 sm:pt-10 sm:pb-10">
          {children}
        </main>
        <LuxuryBottomNav />
      </div>
    </div>
  );
}
