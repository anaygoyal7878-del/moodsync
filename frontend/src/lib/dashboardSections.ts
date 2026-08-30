import {
  Bot,
  Home,
  Link2,
  Sparkles,
  Sparkle,
  Zap,
  Bell,
  TrendingUp,
  Wand2,
  CalendarClock,
  Settings,
  Music,
  DoorOpen,
  BatteryMedium,
  Timer,
  Moon,
  HeartPulse,
  Repeat,
  Brain,
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
/**
 * Three groups, not five. The rail carries ~20 destinations either way,
 * but every extra group header is another heading to read past before
 * the eye reaches a link — five headers turned one scan into five, which
 * is what made a control center feel like a directory.
 *
 * The three that survive are the three real questions: how am I (Daily),
 * what have I learned (Understand), and what is my space doing plus how
 * is it configured (Home & settings — smart-home control and account
 * settings are both configuration, and splitting them bought nothing).
 *
 * Order within each group is unchanged, and no destination was dropped:
 * DASHBOARD_SECTIONS derives from this, and LuxuryProfile's mobile
 * overflow lists everything the bottom bar doesn't, so a route missing
 * here would be unreachable on a phone.
 */
export const NAV_GROUPS = [
  {
    label: "Daily",
    items: [
      { href: "/dashboard", label: "Today", icon: Home, exact: true },
      // Leads the group after Today: Clara is the conversational front
      // door to the whole intelligence engine, not one routine among
      // many. She runs on the same engine as the messaging channel —
      // two surfaces, one agent (docs/CLARA_ARCHITECTURE.md).
      { href: "/dashboard/clara", label: "Clara", icon: Bot },
      { href: "/dashboard/energy", label: "Energy", icon: BatteryMedium },
      { href: "/dashboard/focus", label: "Focus", icon: Timer },
      { href: "/dashboard/sleep", label: "Sleep", icon: Moon },
      { href: "/dashboard/recovery", label: "Recovery", icon: HeartPulse },
      { href: "/dashboard/mood", label: "Mood", icon: Brain },
      { href: "/dashboard/habits", label: "Habits", icon: Repeat },
      { href: "/dashboard/meditation", label: "Meditate", icon: Sparkle },
      { href: "/dashboard/music", label: "Music", icon: Music },
    ],
  },
  {
    label: "Understand",
    items: [
      { href: "/dashboard/insights", label: "Insights", icon: TrendingUp },
      { href: "/dashboard/weekly-report", label: "Weekly report", icon: CalendarClock },
      { href: "/dashboard/wellness", label: "Wellness scores", icon: Sparkles },
      { href: "/dashboard/recommendations", label: "Recommendations", icon: Wand2 },
    ],
  },
  {
    // Smart home is an output of the intelligence engine, not the
    // product — grouped last, below everything a user without a single
    // connected device still gets full value from. The intelligence
    // surface leads: it's the "what should my space be doing" answer,
    // and the ones below it answer "what is it doing".
    label: "Home & settings",
    items: [
      { href: "/dashboard/home", label: "Scenes", icon: DoorOpen },
      { href: "/dashboard/automation", label: "Automations", icon: Zap },
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
