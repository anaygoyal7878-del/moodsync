import type { DemoScenario } from "./AutomationDemo";

/**
 * Every scenario here is buildable with the automation rule model MoodSync
 * actually ships (see shared/src/automation.ts): a RuleCondition against a
 * real biometric/wellness field, optional TimeWindow, and real ActionTypes
 * (hue.set_brightness/set_color_temperature/set_scene, spotify.play_playlist,
 * notification.reduce_intensity). No locks, security systems, weather,
 * calendar, or scent/diffuser hardware — none of those are real MoodSync
 * integrations, so they're deliberately left out of this gallery.
 */
export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "wind-down",
    emoji: "🌙",
    title: "Recovery Wind-Down",
    description: "A low WHOOP recovery score dims your lights and switches Spotify to something calmer.",
    metricLabel: "Recovery (WHOOP)",
    ruleLabel: "Wind down when recovery is low",
    deviceLabel: "Living Room Lamp",
    steps: [
      { caption: "Your WHOOP syncs this morning.", metricValue: 78, alert: false, ruleMatched: false, light: { on: true, warm: false, brightness: 100 }, playlist: null, logged: false },
      { caption: "Recovery comes back low — 32%.", metricValue: 32, alert: true, ruleMatched: false, light: { on: true, warm: false, brightness: 100 }, playlist: null, logged: false },
      { caption: 'MoodSync matches your rule: "Wind down when recovery is low."', metricValue: 32, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 100 }, playlist: null, logged: false },
      { caption: "Your Hue lights dim and warm automatically.", metricValue: 32, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 30 }, playlist: null, logged: false },
      { caption: "Spotify switches to a wind-down playlist.", metricValue: 32, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 30 }, playlist: "Wind Down", logged: false },
      { caption: "Logged to your automation history — what fired, and why.", metricValue: 32, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 30 }, playlist: "Wind Down", logged: true },
    ],
  },
  {
    id: "stress-relief",
    emoji: "🫀",
    title: "Adaptive Stress Relief",
    description: "When your stress score climbs above your normal range, MoodSync builds a calming environment automatically.",
    metricLabel: "Stress (Apple Health)",
    ruleLabel: "Calm reset when stress is elevated",
    deviceLabel: "Bedroom Lamp",
    steps: [
      { caption: "Your Apple Watch reports a normal afternoon.", metricValue: 28, alert: false, ruleMatched: false, light: { on: true, warm: false, brightness: 100 }, playlist: null, notification: null, logged: false },
      { caption: "Stress jumps to 74% — well above your baseline.", metricValue: 74, alert: true, ruleMatched: false, light: { on: true, warm: false, brightness: 100 }, playlist: null, notification: null, logged: false },
      { caption: 'MoodSync matches your rule: "Calm reset when stress is elevated."', metricValue: 74, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 100 }, playlist: null, notification: null, logged: false },
      { caption: "Your Hue lights shift to a low, warm calming scene.", metricValue: 74, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 25 }, playlist: null, notification: null, logged: false },
      { caption: "Spotify starts a calming playlist.", metricValue: 74, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 25 }, playlist: "Calm Focus", notification: null, logged: false },
      { caption: "Non-urgent notifications are quieted for the next hour.", metricValue: 74, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 25 }, playlist: "Calm Focus", notification: "Reduced for 1 hour", logged: true },
    ],
  },
  {
    id: "focus-mode",
    emoji: "🧠",
    title: "Scheduled Focus Mode",
    description: "A daily 9-to-5 time window pairs with your focus score to trigger a work-ready environment — no calendar integration needed.",
    metricLabel: "Focus (MoodSync score)",
    ruleLabel: "Focus mode, weekdays 9am–5pm",
    deviceLabel: "Office Lights",
    steps: [
      { caption: "It's 9:14am — inside your Focus Mode time window.", metricValue: 42, alert: false, ruleMatched: false, light: { on: true, warm: true, brightness: 60 }, playlist: null, notification: null, logged: false },
      { caption: "Your focus score reads low — 31%.", metricValue: 31, alert: true, ruleMatched: false, light: { on: true, warm: true, brightness: 60 }, playlist: null, notification: null, logged: false },
      { caption: 'MoodSync matches your rule: "Focus mode, weekdays 9am–5pm."', metricValue: 31, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 60 }, playlist: null, notification: null, logged: false },
      { caption: "Office lights switch to cool, bright white.", metricValue: 31, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 90 }, playlist: null, notification: null, logged: false },
      { caption: "Spotify starts a deep-focus instrumental playlist.", metricValue: 31, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 90 }, playlist: "Deep Focus", notification: null, logged: false },
      { caption: "Non-urgent notifications are silenced until 5pm.", metricValue: 31, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 90 }, playlist: "Deep Focus", notification: "Silenced until 5:00pm", logged: true },
    ],
  },
  {
    id: "recovery-intelligence",
    emoji: "💪",
    title: "Post-Workout Recovery",
    description: "A spike in activity followed by a recovery dip switches your home into a cooling, restorative mode.",
    metricLabel: "Activity (Amazfit)",
    ruleLabel: "Recovery mode after a hard workout",
    deviceLabel: "Living Room Lamp",
    steps: [
      { caption: "Your Amazfit logs a strenuous training session.", metricValue: 91, alert: true, ruleMatched: false, light: { on: true, warm: false, brightness: 100 }, playlist: null, logged: false },
      { caption: "Recovery score drops to 29% right after.", metricValue: 29, alert: true, ruleMatched: false, light: { on: true, warm: false, brightness: 100 }, playlist: null, logged: false },
      { caption: 'MoodSync matches your rule: "Recovery mode after a hard workout."', metricValue: 29, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 100 }, playlist: null, logged: false },
      { caption: "Hue lights shift to a cooler, dimmer recovery scene.", metricValue: 29, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 40 }, playlist: null, logged: false },
      { caption: "Spotify starts a low-tempo recovery playlist.", metricValue: 29, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 40 }, playlist: "Recovery Chill", logged: false },
      { caption: "Logged to your automation history — what fired, and why.", metricValue: 29, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 40 }, playlist: "Recovery Chill", logged: true },
    ],
  },
  {
    id: "sleep-prep",
    emoji: "😴",
    title: "Sleep Preparation",
    description: "A nightly time window checks your sleep score and eases your home toward bedtime automatically.",
    metricLabel: "Sleep score (MoodSync)",
    ruleLabel: "Sleep preparation, 9pm–11pm",
    deviceLabel: "Bedroom Lamp",
    steps: [
      { caption: "It's 9:32pm — inside your Sleep Preparation window.", metricValue: 88, alert: false, ruleMatched: false, light: { on: true, warm: false, brightness: 100 }, playlist: null, notification: null, logged: false },
      { caption: "Your sleep score trend reads low tonight — 34%.", metricValue: 34, alert: true, ruleMatched: false, light: { on: true, warm: false, brightness: 100 }, playlist: null, notification: null, logged: false },
      { caption: 'MoodSync matches your rule: "Sleep preparation, 9pm–11pm."', metricValue: 34, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 100 }, playlist: null, notification: null, logged: false },
      { caption: "Bedroom lights dim to a warm, minimal glow.", metricValue: 34, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 12 }, playlist: null, notification: null, logged: false },
      { caption: "Spotify eases into a sleep playlist.", metricValue: 34, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 12 }, playlist: "Deep Sleep", notification: null, logged: false },
      { caption: "Quiet hours kick in — notifications hold until morning.", metricValue: 34, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 12 }, playlist: "Deep Sleep", notification: "Held until 7:00am", logged: true },
    ],
  },
];
