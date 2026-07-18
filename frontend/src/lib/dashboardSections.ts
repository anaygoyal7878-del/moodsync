import { Home, Link2, Activity, Sparkles, Zap, Bell, TrendingUp, Cpu, Wand2, CalendarClock, User } from "lucide-react";

/** Every real /dashboard/* page, in one place — Sidebar.tsx (desktop
 * nav) and SearchBar.tsx (the "jump to a page" part of dashboard search)
 * both read from this so they can't drift apart on what pages actually
 * exist. BottomTabBar.tsx intentionally keeps its own smaller, curated
 * subset (a fixed bottom bar only fits ~6 items) rather than importing
 * this whole list. */
export const DASHBOARD_SECTIONS = [
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
  { href: "/dashboard/profile", label: "Profile", icon: User },
] as const;
