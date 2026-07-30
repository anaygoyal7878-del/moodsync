import {
  Home,
  Link2,
  Activity,
  Sparkles,
  Sparkle,
  Zap,
  Bell,
  TrendingUp,
  Cpu,
  Wand2,
  CalendarClock,
  Settings,
  Bot,
  Music,
  DoorOpen,
  BatteryMedium,
  Timer,
  Moon,
  HeartPulse,
  Repeat,
  type LucideIcon,
} from "lucide-react";

/**
 * The app's information architecture, organized around what a person
 * actually does in a day rather than around which subsystem a feature
 * happens to live in.
 *
 * `NAV_GROUPS` is the grouped structure the desktop sidebar renders —
 * the web app is the control center, so it shows everything, grouped.
 * `DASHBOARD_SECTIONS` stays a flat derivation of the same data for
 * search, so the two can't drift. `BOTTOM_NAV_TABS` (in
 * LuxuryBottomNav.tsx) is deliberately a much smaller daily-use subset:
 * mobile is the companion, not the console.
 */
export const NAV_GROUPS = [
  {
    label: "Today",
    items: [
      { href: "/dashboard", label: "Today", icon: Home, exact: true },
      { href: "/dashboard/energy", label: "Energy", icon: BatteryMedium },
      { href: "/dashboard/focus", label: "Focus", icon: Timer },
      { href: "/dashboard/sleep", label: "Sleep", icon: Moon },
      { href: "/dashboard/recovery", label: "Recovery", icon: HeartPulse },
    ],
  },
  {
    label: "Routines",
    items: [
      { href: "/dashboard/habits", label: "Habits", icon: Repeat },
      { href: "/dashboard/meditation", label: "Meditate", icon: Sparkle },
      { href: "/dashboard/music", label: "Music", icon: Music },
      { href: "/dashboard/atlas", label: "Atlas", icon: Bot },
    ],
  },
  {
    label: "Understand",
    items: [
      { href: "/dashboard/insights", label: "Insights", icon: TrendingUp },
      { href: "/dashboard/weekly-report", label: "Weekly report", icon: CalendarClock },
      { href: "/dashboard/wellness", label: "Wellness scores", icon: Sparkles },
      { href: "/dashboard/biometrics", label: "Biometrics", icon: Activity },
      { href: "/dashboard/recommendations", label: "Recommendations", icon: Wand2 },
    ],
  },
  {
    // Smart home is an output of the intelligence engine, not the
    // product — grouped here, below everything a user without a single
    // connected device still gets full value from.
    label: "Environment",
    items: [
      { href: "/dashboard/home", label: "Scenes", icon: DoorOpen },
      { href: "/dashboard/devices", label: "Devices", icon: Cpu },
      { href: "/dashboard/automation", label: "Automations", icon: Zap },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/dashboard/connections", label: "Connections", icon: Link2 },
      { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
      { href: "/dashboard/profile", label: "Settings", icon: Settings },
    ],
  },
] as const;

export interface DashboardSection {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only Home sets this — every other route matches by prefix so its
   * sub-pages keep the parent highlighted. */
  exact?: boolean;
}

/** Flat list of every real /dashboard/* page — what SearchBar.tsx's
 * "jump to a page" and LuxuryProfile's mobile overflow list both need.
 * Derived from NAV_GROUPS so a page can never exist in one and not the
 * other. The explicit annotation widens the `as const` literal tuples
 * back to a uniform array type; without it `flatMap` over heterogeneous
 * readonly tuples infers `unknown`. */
export const DASHBOARD_SECTIONS: DashboardSection[] = NAV_GROUPS.flatMap(
  (group) => group.items as readonly DashboardSection[],
);
