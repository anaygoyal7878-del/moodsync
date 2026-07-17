"use client";

import { useRouter } from "next/navigation";
import Dock from "@/components/effects/Dock";
import { Link2, Activity, Sparkles, Zap, Bell, TrendingUp, Cpu, Wand2, CalendarClock } from "lucide-react";

/** Quick nav across the dashboard's per-feature pages (see
 * dashboard/page.tsx for the full index) — each item navigates to that
 * feature's own route rather than scrolling a shared long page. */
const SECTIONS = [
  { href: "/dashboard/connections", label: "Connections", icon: <Link2 size={18} /> },
  { href: "/dashboard/biometrics", label: "Biometrics", icon: <Activity size={18} /> },
  { href: "/dashboard/wellness", label: "Wellness", icon: <Sparkles size={18} /> },
  { href: "/dashboard/recommendations", label: "Recommendations", icon: <Wand2 size={18} /> },
  { href: "/dashboard/insights", label: "Insights", icon: <TrendingUp size={18} /> },
  { href: "/dashboard/devices", label: "Devices", icon: <Cpu size={18} /> },
  { href: "/dashboard/weekly-report", label: "Weekly report", icon: <CalendarClock size={18} /> },
  { href: "/dashboard/automation", label: "Automations", icon: <Zap size={18} /> },
  { href: "/dashboard/notifications", label: "Notifications", icon: <Bell size={18} /> },
];

export function DashboardDock() {
  const router = useRouter();

  const items = SECTIONS.map((section) => ({
    icon: section.icon,
    label: section.label,
    onClick: () => router.push(section.href),
  }));

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center" style={{ height: "6rem" }}>
      <div className="pointer-events-auto relative w-full">
        <Dock items={items} panelHeight={56} baseItemSize={40} magnification={56} dockHeight={56} distance={140} />
      </div>
    </div>
  );
}
