// notification.* is modeled in the schema (Milestone 4) but has no
// dedicated executor — every dispatch outcome now generates a real
// notification automatically instead (see ai/src/dispatch.ts /
// ai/src/notificationExecutor.ts), so surfacing a notification-only
// action type still isn't useful here.
export const ACTION_TYPES = [
  { value: "hue.set_scene", label: "Activate a Hue scene", provider: "hue" },
  { value: "hue.set_brightness", label: "Set a light's brightness", provider: "hue" },
  { value: "hue.set_color_temperature", label: "Set a light's color temperature", provider: "hue" },
  { value: "spotify.play_playlist", label: "Play a Spotify playlist", provider: "spotify" },
  // No OAuth "connection" exists for this the way Hue/Spotify have one —
  // HomeKit is device-side only (see docs/HOMEKIT_ARCHITECTURE.md), so
  // this always queues for the iOS companion app rather than needing a
  // connect step first.
  { value: "homekit.activate_scene", label: "Activate a HomeKit scene (via iOS app)", provider: "homekit" },
] as const;

export type ActionType = (typeof ACTION_TYPES)[number]["value"];

/** Seven of the eight Decision Engine automation scenarios (see
 * docs/DECISION_ENGINE_ARCHITECTURE.md) as selectable starting points —
 * still fully user-editable after applying, not hardcoded system rules.
 * Only Travel/away-mode is absent here (it has its own trigger shape —
 * `locationTrigger`, not a condition — see RuleForm.tsx's separate
 * arrival/departure UI). Sleep Detection is here as a HomeKit scene
 * activation — it can't automatically confirm lock/security state (see
 * docs/HOMEKIT_ARCHITECTURE.md and the real CheckSecurityIntent voice
 * command for why), but activating a user-configured "MoodSync Sleep"
 * scene (which can itself include locking a HomeKit-compatible lock, if
 * the user built the scene that way) plus the automatic notification
 * every dispatch outcome already generates is the real, honest version
 * of this scenario.
 *
 * Each template uses a single condition to fit RuleForm's current
 * single-condition builder, even where the underlying rule shape
 * (`RuleCondition[]`) supports ANDing several — a real simplification,
 * not a claim that e.g. "Elevated Stress" checks HRV too.
 *
 * Shared between RuleForm.tsx (the template picker dropdown) and
 * QuickActions.tsx (the dashboard home's one-tap shortcuts, which
 * navigate to `/dashboard/automation?template=<id>` rather than
 * submitting blind — a Hue action needs a real `deviceId` from the
 * user's actual connected lights, which a home-page tap has no way to
 * know, so the honest "quick action" here is a pre-filled form, not a
 * silently-broken rule). */
export const TEMPLATES = [
  {
    id: "elevated-stress",
    label: "Elevated Stress — dim & calm when heart rate spikes",
    name: "Elevated Stress",
    field: "heartRate" as const,
    operator: "gt" as const,
    value: "95",
    actionType: "hue.set_color_temperature" as ActionType,
    mirek: "450",
    cooldownMinutes: "30",
    priority: "70",
    timeWindow: null as { start: string; end: string } | null,
  },
  {
    id: "focus-mode",
    label: "Focus Mode — bright & cool during work hours",
    name: "Focus Mode",
    field: "heartRate" as const,
    operator: "gt" as const,
    value: "0",
    actionType: "hue.set_color_temperature" as ActionType,
    mirek: "250",
    cooldownMinutes: "60",
    priority: "50",
    timeWindow: { start: "09:00", end: "17:00" },
  },
  {
    id: "sleep-preparation",
    label: "Sleep Preparation — dim & warm before bed",
    name: "Sleep Preparation",
    field: "heartRate" as const,
    operator: "gt" as const,
    value: "0",
    actionType: "hue.set_color_temperature" as ActionType,
    mirek: "454",
    cooldownMinutes: "1440",
    priority: "80",
    timeWindow: { start: "21:30", end: "22:30" },
  },
  {
    id: "wake-up",
    label: "Wake Up — gentle brightness ramp in the morning",
    name: "Wake Up",
    field: "heartRate" as const,
    operator: "gt" as const,
    value: "0",
    actionType: "hue.set_brightness" as ActionType,
    brightness: "20",
    cooldownMinutes: "1440",
    priority: "60",
    timeWindow: { start: "06:00", end: "08:00" },
  },
  {
    id: "workout",
    label: "Workout — energizing scene when heart rate is high",
    name: "Workout",
    field: "heartRate" as const,
    operator: "gt" as const,
    value: "120",
    actionType: "hue.set_brightness" as ActionType,
    brightness: "100",
    cooldownMinutes: "20",
    priority: "70",
    timeWindow: null,
  },
  {
    id: "recovery",
    label: "Recovery — lower-intensity scene after activity",
    name: "Recovery",
    field: "activityLevel" as const,
    operator: "gte" as const,
    value: "60",
    actionType: "hue.set_brightness" as ActionType,
    brightness: "35",
    cooldownMinutes: "60",
    priority: "60",
    timeWindow: null,
  },
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
    timeWindow: null,
  },
] as const;

export type RuleTemplate = (typeof TEMPLATES)[number];
