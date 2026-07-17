import type { DemoScenario } from "./AutomationDemo";

/**
 * The first 5 scenarios are buildable with the automation rule model
 * MoodSync actually ships (see shared/src/automation.ts): a RuleCondition
 * against a real biometric/wellness field, optional TimeWindow, and real
 * ActionTypes (hue.set_brightness/set_color_temperature/set_scene,
 * spotify.play_playlist, notification.reduce_intensity).
 *
 * The last 4 (`concept: true`) show product vision beyond what's
 * integrated today — smart locks/security, weather, calendar, and
 * scent/diffuser hardware have no real MoodSync API behind them yet. They
 * stay in the gallery because a demo is exactly the place to show where
 * the product is headed, but each carries a "Concept" badge (see
 * DemoGallery.tsx) so nobody mistakes it for a rule they can build today.
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
      { caption: "Your WHOOP syncs this morning.", metricValue: 78, alert: false, ruleMatched: false, light: { on: true, warm: false, brightness: 100 }, chips: [{ label: "Spotify", value: null }], logged: false },
      { caption: "Recovery comes back low — 32%.", metricValue: 32, alert: true, ruleMatched: false, light: { on: true, warm: false, brightness: 100 }, chips: [{ label: "Spotify", value: null }], logged: false },
      { caption: 'MoodSync matches your rule: "Wind down when recovery is low."', metricValue: 32, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 100 }, chips: [{ label: "Spotify", value: null }], logged: false },
      { caption: "Your Hue lights dim and warm automatically.", metricValue: 32, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 30 }, chips: [{ label: "Spotify", value: null }], logged: false },
      { caption: "Spotify switches to a wind-down playlist.", metricValue: 32, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 30 }, chips: [{ label: "Spotify", value: "Wind Down" }], logged: false },
      { caption: "Logged to your automation history — what fired, and why.", metricValue: 32, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 30 }, chips: [{ label: "Spotify", value: "Wind Down" }], logged: true },
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
      { caption: "Your Apple Watch reports a normal afternoon.", metricValue: 28, alert: false, ruleMatched: false, light: { on: true, warm: false, brightness: 100 }, chips: [{ label: "Spotify", value: null }, { label: "Notifications", value: null }], logged: false },
      { caption: "Stress jumps to 74% — well above your baseline.", metricValue: 74, alert: true, ruleMatched: false, light: { on: true, warm: false, brightness: 100 }, chips: [{ label: "Spotify", value: null }, { label: "Notifications", value: null }], logged: false },
      { caption: 'MoodSync matches your rule: "Calm reset when stress is elevated."', metricValue: 74, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 100 }, chips: [{ label: "Spotify", value: null }, { label: "Notifications", value: null }], logged: false },
      { caption: "Your Hue lights shift to a low, warm calming scene.", metricValue: 74, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 25 }, chips: [{ label: "Spotify", value: null }, { label: "Notifications", value: null }], logged: false },
      { caption: "Spotify starts a calming playlist.", metricValue: 74, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 25 }, chips: [{ label: "Spotify", value: "Calm Focus" }, { label: "Notifications", value: null }], logged: false },
      { caption: "Non-urgent notifications are quieted for the next hour.", metricValue: 74, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 25 }, chips: [{ label: "Spotify", value: "Calm Focus" }, { label: "Notifications", value: "Reduced for 1 hour" }], logged: true },
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
      { caption: "It's 9:14am — inside your Focus Mode time window.", metricValue: 42, alert: false, ruleMatched: false, light: { on: true, warm: true, brightness: 60 }, chips: [{ label: "Spotify", value: null }, { label: "Notifications", value: null }], logged: false },
      { caption: "Your focus score reads low — 31%.", metricValue: 31, alert: true, ruleMatched: false, light: { on: true, warm: true, brightness: 60 }, chips: [{ label: "Spotify", value: null }, { label: "Notifications", value: null }], logged: false },
      { caption: 'MoodSync matches your rule: "Focus mode, weekdays 9am–5pm."', metricValue: 31, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 60 }, chips: [{ label: "Spotify", value: null }, { label: "Notifications", value: null }], logged: false },
      { caption: "Office lights switch to cool, bright white.", metricValue: 31, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 90 }, chips: [{ label: "Spotify", value: null }, { label: "Notifications", value: null }], logged: false },
      { caption: "Spotify starts a deep-focus instrumental playlist.", metricValue: 31, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 90 }, chips: [{ label: "Spotify", value: "Deep Focus" }, { label: "Notifications", value: null }], logged: false },
      { caption: "Non-urgent notifications are silenced until 5pm.", metricValue: 31, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 90 }, chips: [{ label: "Spotify", value: "Deep Focus" }, { label: "Notifications", value: "Silenced until 5:00pm" }], logged: true },
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
      { caption: "Your Amazfit logs a strenuous training session.", metricValue: 91, alert: true, ruleMatched: false, light: { on: true, warm: false, brightness: 100 }, chips: [{ label: "Spotify", value: null }], logged: false },
      { caption: "Recovery score drops to 29% right after.", metricValue: 29, alert: true, ruleMatched: false, light: { on: true, warm: false, brightness: 100 }, chips: [{ label: "Spotify", value: null }], logged: false },
      { caption: 'MoodSync matches your rule: "Recovery mode after a hard workout."', metricValue: 29, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 100 }, chips: [{ label: "Spotify", value: null }], logged: false },
      { caption: "Hue lights shift to a cooler, dimmer recovery scene.", metricValue: 29, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 40 }, chips: [{ label: "Spotify", value: null }], logged: false },
      { caption: "Spotify starts a low-tempo recovery playlist.", metricValue: 29, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 40 }, chips: [{ label: "Spotify", value: "Recovery Chill" }], logged: false },
      { caption: "Logged to your automation history — what fired, and why.", metricValue: 29, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 40 }, chips: [{ label: "Spotify", value: "Recovery Chill" }], logged: true },
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
      { caption: "It's 9:32pm — inside your Sleep Preparation window.", metricValue: 88, alert: false, ruleMatched: false, light: { on: true, warm: false, brightness: 100 }, chips: [{ label: "Spotify", value: null }, { label: "Notifications", value: null }], logged: false },
      { caption: "Your sleep score trend reads low tonight — 34%.", metricValue: 34, alert: true, ruleMatched: false, light: { on: true, warm: false, brightness: 100 }, chips: [{ label: "Spotify", value: null }, { label: "Notifications", value: null }], logged: false },
      { caption: 'MoodSync matches your rule: "Sleep preparation, 9pm–11pm."', metricValue: 34, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 100 }, chips: [{ label: "Spotify", value: null }, { label: "Notifications", value: null }], logged: false },
      { caption: "Bedroom lights dim to a warm, minimal glow.", metricValue: 34, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 12 }, chips: [{ label: "Spotify", value: null }, { label: "Notifications", value: null }], logged: false },
      { caption: "Spotify eases into a sleep playlist.", metricValue: 34, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 12 }, chips: [{ label: "Spotify", value: "Deep Sleep" }, { label: "Notifications", value: null }], logged: false },
      { caption: "Quiet hours kick in — notifications hold until morning.", metricValue: 34, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 12 }, chips: [{ label: "Spotify", value: "Deep Sleep" }, { label: "Notifications", value: "Held until 7:00am" }], logged: true },
    ],
  },

  // --- Concept scenarios: product vision, not yet real integrations ---

  {
    id: "sleep-security",
    emoji: "🔒",
    title: "Smart Sleep Security",
    description: "Once your wearable detects you've fallen asleep, MoodSync checks your locks and security system and flags anything left open.",
    metricLabel: "Sleep stage (wearable)",
    ruleLabel: "Bedtime security check",
    deviceLabel: "Front Door Lock",
    concept: true,
    steps: [
      { caption: "Your wearable reports you're still awake.", metricValue: 20, alert: false, ruleMatched: false, chips: [{ label: "Front Door Lock", value: null }, { label: "Security System", value: null }], logged: false },
      { caption: "Sleep stage shifts — you've just fallen asleep.", metricValue: 95, alert: true, ruleMatched: false, chips: [{ label: "Front Door Lock", value: null }, { label: "Security System", value: null }], logged: false },
      { caption: 'MoodSync matches your rule: "Bedtime security check."', metricValue: 95, alert: true, ruleMatched: true, chips: [{ label: "Front Door Lock", value: null }, { label: "Security System", value: null }], logged: false },
      { caption: "It checks your smart lock status.", metricValue: 95, alert: true, ruleMatched: true, chips: [{ label: "Front Door Lock", value: "Unlocked" }, { label: "Security System", value: null }], logged: false },
      { caption: "The back door was left unlocked and the alarm isn't armed.", metricValue: 95, alert: true, ruleMatched: true, chips: [{ label: "Front Door Lock", value: "Unlocked" }, { label: "Security System", value: "Disarmed" }], logged: false },
      { caption: 'A push notification is sent: "Back door unlocked, alarm not armed."', metricValue: 95, alert: true, ruleMatched: true, chips: [{ label: "Front Door Lock", value: "Unlocked" }, { label: "Security System", value: "Disarmed" }, { label: "Notifications", value: "Alert sent" }], logged: true },
    ],
  },
  {
    id: "arrival-intelligence",
    emoji: "🏡",
    title: "Arrival Intelligence",
    description: "When you get home after a stressful day, MoodSync would prepare a wellness scene — lighting, fragrance, and audio — tuned to your recent biometric trend.",
    metricLabel: "Stress trend (last 4 hours)",
    ruleLabel: "Prepare wellness scene on arrival",
    deviceLabel: "Living Room Lamp",
    concept: true,
    steps: [
      { caption: "Your phone leaves the office geofence.", metricValue: 30, alert: false, ruleMatched: false, light: { on: false, warm: false, brightness: 0 }, chips: [{ label: "Diffuser", value: null }, { label: "Spotify", value: null }], logged: false },
      { caption: "Today's stress trend reads elevated — 81%.", metricValue: 81, alert: true, ruleMatched: false, light: { on: false, warm: false, brightness: 0 }, chips: [{ label: "Diffuser", value: null }, { label: "Spotify", value: null }], logged: false },
      { caption: "You arrive home — geofence entry detected.", metricValue: 81, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 40 }, chips: [{ label: "Diffuser", value: null }, { label: "Spotify", value: null }], logged: false },
      { caption: "Lights warm up to a calming scene.", metricValue: 81, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 35 }, chips: [{ label: "Diffuser", value: null }, { label: "Spotify", value: null }], logged: false },
      { caption: "A lavender diffuser blend starts.", metricValue: 81, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 35 }, chips: [{ label: "Diffuser", value: "Lavender · Calm" }, { label: "Spotify", value: null }], logged: false },
      { caption: "Spotify starts a decompression playlist.", metricValue: 81, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 35 }, chips: [{ label: "Diffuser", value: "Lavender · Calm" }, { label: "Spotify", value: "Decompress" }], logged: true },
    ],
  },
  {
    id: "weather-wellness",
    emoji: "🌤️",
    title: "Weather-Aware Wellness",
    description: "MoodSync would combine live weather, air quality, and pollen data with your biometrics to adjust your indoor environment ahead of time.",
    metricLabel: "Air quality index",
    ruleLabel: "High pollen + AQI response",
    deviceLabel: "Living Room Lamp",
    concept: true,
    steps: [
      { caption: "Morning air quality reads normal.", metricValue: 25, alert: false, ruleMatched: false, chips: [{ label: "Air Purifier", value: null }, { label: "Thermostat", value: null }], logged: false },
      { caption: "AQI spikes to 78 with high pollen count.", metricValue: 78, alert: true, ruleMatched: false, chips: [{ label: "Air Purifier", value: null }, { label: "Thermostat", value: null }], logged: false },
      { caption: 'MoodSync matches your rule: "High pollen + AQI response."', metricValue: 78, alert: true, ruleMatched: true, chips: [{ label: "Air Purifier", value: null }, { label: "Thermostat", value: null }], logged: false },
      { caption: "Windows-closed reminder sent, air purifier switches to high.", metricValue: 78, alert: true, ruleMatched: true, chips: [{ label: "Air Purifier", value: "High" }, { label: "Thermostat", value: null }], logged: false },
      { caption: "Thermostat switches to recirculate mode.", metricValue: 78, alert: true, ruleMatched: true, chips: [{ label: "Air Purifier", value: "High" }, { label: "Thermostat", value: "Recirculate" }], logged: false },
      { caption: "Logged to your automation history — what fired, and why.", metricValue: 78, alert: true, ruleMatched: true, chips: [{ label: "Air Purifier", value: "High" }, { label: "Thermostat", value: "Recirculate" }], logged: true },
    ],
  },
  {
    id: "calendar-prep",
    emoji: "📅",
    title: "Calendar-Aware Preparation",
    description: "MoodSync would read your calendar and prepare your room ahead of an important meeting, a study block, or bedtime.",
    metricLabel: "Minutes until next event",
    ruleLabel: "Prep room 10 min before flagged events",
    deviceLabel: "Office Lights",
    concept: true,
    steps: [
      { caption: "Your calendar shows a free morning.", metricValue: 90, alert: false, ruleMatched: false, light: { on: true, warm: true, brightness: 60 }, chips: [{ label: "Spotify", value: null }, { label: "Notifications", value: null }], logged: false },
      { caption: '"Board review" starts in 10 minutes — flagged as high-focus.', metricValue: 10, alert: true, ruleMatched: false, light: { on: true, warm: true, brightness: 60 }, chips: [{ label: "Spotify", value: null }, { label: "Notifications", value: null }], logged: false },
      { caption: 'MoodSync matches your rule: "Prep room 10 min before flagged events."', metricValue: 10, alert: true, ruleMatched: true, light: { on: true, warm: true, brightness: 60 }, chips: [{ label: "Spotify", value: null }, { label: "Notifications", value: null }], logged: false },
      { caption: "Office lights switch to bright, neutral white.", metricValue: 10, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 95 }, chips: [{ label: "Spotify", value: null }, { label: "Notifications", value: null }], logged: false },
      { caption: "Music pauses automatically.", metricValue: 10, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 95 }, chips: [{ label: "Spotify", value: "Paused" }, { label: "Notifications", value: null }], logged: false },
      { caption: "Notifications silence for the meeting's duration.", metricValue: 10, alert: true, ruleMatched: true, light: { on: true, warm: false, brightness: 95 }, chips: [{ label: "Spotify", value: "Paused" }, { label: "Notifications", value: "Silenced · 45 min" }], logged: true },
    ],
  },
];
