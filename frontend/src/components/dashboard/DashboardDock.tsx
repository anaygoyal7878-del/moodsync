"use client";

import Dock from "@/components/effects/Dock";
import { LinkIcon, PulseIcon, SparkleIcon, BoltIcon, BellIcon } from "./DockIcons";

/** Quick-jump navigation for the dashboard's long scrolling page — each
 * item scrolls its matching section (ids set on the sections themselves
 * in dashboard/page.tsx) into view rather than firing an alert like the
 * component's own demo usage. */
const SECTIONS = [
  { id: "connections", label: "Connections", icon: <LinkIcon /> },
  { id: "biometrics", label: "Biometrics", icon: <PulseIcon /> },
  { id: "wellness", label: "Wellness", icon: <SparkleIcon /> },
  { id: "automation-rules", label: "Automations", icon: <BoltIcon /> },
  { id: "notifications", label: "Notifications", icon: <BellIcon /> },
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
