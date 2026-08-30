// notification.* is modeled in the schema (Milestone 4) but has no
// dedicated executor — every dispatch outcome now generates a real
// notification automatically instead (see ai/src/dispatch.ts /
// ai/src/notificationExecutor.ts), so surfacing a notification-only
// action type still isn't useful here.
export const ACTION_TYPES = [
  { value: "spotify.play_playlist", label: "Play a Spotify playlist", provider: "spotify" },
  // No OAuth "connection" exists for this the way Spotify has one —
  // HomeKit is device-side only (see docs/HOMEKIT_ARCHITECTURE.md), so
  // this always queues for the iOS companion app rather than needing a
  // connect step first.
  { value: "homekit.activate_scene", label: "Activate a HomeKit scene (via iOS app)", provider: "homekit" },
] as const;

export type ActionType = (typeof ACTION_TYPES)[number]["value"];

/** Selectable starting points from the Decision Engine automation
 * scenarios (see docs/DECISION_ENGINE_ARCHITECTURE.md) — still fully
 * user-editable after applying, not hardcoded system rules. Sleep
 * Detection is here as a HomeKit scene activation — it can't
 * automatically confirm lock/security state (see
 * docs/HOMEKIT_ARCHITECTURE.md and the real CheckSecurityIntent voice
 * command for why), but activating a user-configured "MoodSync Sleep"
 * scene (which can itself include locking a HomeKit-compatible lock, if
 * the user built the scene that way) plus the automatic notification
 * every dispatch outcome already generates is the real, honest version
 * of this scenario.
 *
 * Each template uses a single condition to fit RuleForm's current
 * single-condition builder, even where the underlying rule shape
 * (`RuleCondition[]`) supports ANDing several.
 *
 * Shared between RuleForm.tsx (the template picker dropdown) and
 * QuickActions.tsx (the dashboard home's one-tap shortcuts). */
export const TEMPLATES = [
  {
    id: "sleep-detected",
    label: "Sleep Detected — activate your bedtime HomeKit scene",
    name: "Sleep Detected",
    // A new sleepScore only appears once a sleep session has completed
    // and synced — the closest real proxy this schema has for "the user
    // fell asleep" (there's no live "currently asleep" boolean from any
    // provider). See docs/HOMEKIT_ARCHITECTURE.md/docs/DECISION_ENGINE_ROADMAP.md
    // for why this can't also auto-confirm locks — that's CheckSecurityIntent's job.
    field: "sleepScore" as const,
    operator: "gte" as const,
    value: "0",
    actionType: "homekit.activate_scene" as ActionType,
    sceneName: "MoodSync Sleep",
    cooldownMinutes: "480",
    priority: "80",
    timeWindow: null as { start: string; end: string } | null,
  },
] as const;

export type RuleTemplate = (typeof TEMPLATES)[number];
