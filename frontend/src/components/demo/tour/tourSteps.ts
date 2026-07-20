/**
 * The guided walkthrough shown on first login — the "understand MoodSync
 * in three minutes without anyone explaining it" path.
 *
 * WHAT GOES IN A STEP: only things the product genuinely does. This file
 * follows the same rule the demo gallery already uses (see
 * components/demo/scenarios.ts): capabilities that ship today are shown
 * as the product working, and everything else is grouped into a single
 * closing step that is explicitly labelled as roadmap. A viewer should
 * never have to guess which of the two they just watched — that
 * distinction is the whole reason the `kind: "roadmap"` step exists
 * rather than folding future hardware into the main narrative.
 *
 * ANCHORING: a step either centres on screen (narrative beats) or
 * spotlights a real element by `anchor`, matched against a
 * `data-tour="<id>"` attribute rendered by the real dashboard. If the
 * anchor isn't on the current route the step's `href` routes there
 * first. An anchor that can't be found degrades to a centred card
 * rather than pointing at nothing.
 */

export type TourStepKind = "narrative" | "feature" | "roadmap";

export interface TourStep {
  id: string;
  kind: TourStepKind;
  title: string;
  /** One or two sentences. Says what it does and why it matters. */
  body: string;
  /** Optional third line, rendered smaller — the "how it works" detail. */
  detail?: string;
  /** `data-tour` value to spotlight. Omit for a centred card. */
  anchor?: string;
  /** Route this step needs. The tour navigates before showing the step. */
  href?: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    kind: "narrative",
    title: "Welcome to MoodSync",
    body: "The intelligence layer between your body and your home.",
    detail:
      "Your wearable already knows when you're stressed, under-recovered, or winding down. Your lights, speakers and thermostat don't. MoodSync connects the two.",
  },
  {
    id: "problem",
    kind: "narrative",
    title: "Wellness apps stop at the chart",
    body:
      "They tell you your recovery is low, then leave the response entirely up to you — at exactly the moment you have the least capacity to act on it.",
    detail: "MoodSync closes that loop automatically, so the environment responds without you doing anything.",
  },
  {
    id: "biometrics",
    kind: "feature",
    title: "It reads real biometric signals",
    body:
      "WHOOP, Fitbit, Apple Health and Amazfit stream in heart rate, HRV, sleep stages, recovery and activity — live samples, not a daily average.",
    detail: "This account is showing seeded demo data so every screen is populated. The integrations behind it are real OAuth connections.",
    anchor: "wellness-score",
    href: "/dashboard",
  },
  {
    id: "analysis",
    kind: "feature",
    title: "AI turns signals into a state",
    body:
      "Raw metrics don't tell you what to do. MoodSync computes stress, energy, focus, recovery and sleep scores from them — one interpreted state.",
    detail: "Every score here is computed by the real wellness engine from the readings above, not stored as a number someone typed in.",
    anchor: "wellness-detail",
    href: "/dashboard/wellness",
  },
  {
    id: "recommendation",
    kind: "feature",
    title: "It suggests what to automate",
    body:
      "MoodSync watches for patterns you'd act on if you noticed them — three low-recovery mornings in a row, a rule you switched off and forgot.",
    detail: "Suggestions point at a real rule template, pre-filled, so accepting one takes a single tap.",
    anchor: "recommendations",
    href: "/dashboard/recommendations",
  },
  {
    id: "automation",
    kind: "feature",
    title: "Then it acts, on its own",
    body:
      "When a rule matches, MoodSync executes it — dimming Hue lights, shifting colour temperature, starting a Spotify playlist, triggering an Alexa routine.",
    detail: "This is a real dispatch engine with cooldowns, priority conflict resolution, rate limits and a full audit trail of every decision.",
    anchor: "automations",
    href: "/dashboard/automation",
  },
  {
    id: "history",
    kind: "feature",
    title: "Everything it did is explainable",
    body:
      "Every firing is logged with the reason it happened, in terms of the actual values involved — including the times it deliberately did nothing.",
    detail: "Skipped for cooldown, lost a conflict, hit a rate limit, paused by you: all recorded, not just the successes.",
    anchor: "activity",
    href: "/dashboard",
  },
  {
    id: "trends",
    kind: "feature",
    title: "And it compounds over time",
    body:
      "Recovery, sleep and stress tracked across weeks, with the trend surfaced rather than left for you to eyeball.",
    detail:
      "The arc in this demo account is illustrative seeded data — it shows what the charts look like populated, not a claim about outcomes MoodSync produces.",
    anchor: "recovery-pattern",
    href: "/dashboard",
  },
  {
    id: "atlas",
    kind: "feature",
    title: "Atlas answers in plain language",
    body:
      "A wellness assistant with your real biometric context — ask why your recovery dropped, or what to change, and get a grounded answer.",
    detail: "Powered by Gemini, reading the same data the rest of the app does.",
    href: "/dashboard/atlas",
  },
  {
    id: "roadmap",
    kind: "roadmap",
    title: "Where this goes next",
    body:
      "Scent and diffuser automation, geofenced arrival/departure triggers, and calendar-aware rules are designed and specced — but not built yet.",
    detail:
      "They're shown in the demo gallery under a Concept badge. Everything in the eight steps before this one is running against a real backend today.",
  },
];
