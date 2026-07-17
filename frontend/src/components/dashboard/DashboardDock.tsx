"use client";

import Dock from "@/components/effects/Dock";
import { Link2, Activity, Sparkles, Zap, Bell, TrendingUp, Cpu } from "lucide-react";

/** Quick-jump navigation for the dashboard's long scrolling page — each
 * item scrolls its matching section (ids set on the sections themselves
 * in dashboard/page.tsx) into view rather than firing an alert like the
 * component's own demo usage. Icons are lucide-react (see DockIcons.tsx'
 * removal note) rather than hand-drawn, now that an icon library exists. */
const SECTIONS = [
  { id: "connections", label: "Connections", icon: <Link2 size={18} /> },
  { id: "biometrics", label: "Biometrics", icon: <Activity size={18} /> },
  { id: "wellness", label: "Wellness", icon: <Sparkles size={18} /> },
  { id: "insights", label: "Insights", icon: <TrendingUp size={18} /> },
  { id: "devices", label: "Devices", icon: <Cpu size={18} /> },
  { id: "automation-rules", label: "Automations", icon: <Zap size={18} /> },
  { id: "notifications", label: "Notifications", icon: <Bell size={18} /> },
];

export function DashboardDock() {
  const items = SECTIONS.map((section) => ({
    icon: section.icon,
    label: section.label,
    onClick: () => document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth", block: "start" }),
  }));

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center" style={{ height: "6rem" }}>
      <div className="pointer-events-auto relative w-full">
        <Dock items={items} panelHeight={56} baseItemSize={40} magnification={56} dockHeight={56} distance={140} />
      </div>
    </div>
  );
}
