/** Every voice command MoodSync's Alexa Custom Skill supports — a
 * verbatim mirror of the real intents in
 * integrations/alexa/src/intents.ts (GetStatus, GetSleepSummary,
 * SyncDevices, StartRelaxation, ImproveFocus, ActivateEveningRoutine,
 * CheckSecurity) and the skill's own HELP_SPEECH. Kept here as the single
 * source of truth so ConnectionsSection and DevicesSection can't drift
 * apart on what the skill actually does.
 *
 * MoodSync's Alexa integration is a **Custom Skill**, not a Smart Home
 * Skill (see docs/ALEXA_ARCHITECTURE.md §1) — the user invokes it by
 * name ("Alexa, ask MoodSync …"). It therefore has no device-discovery
 * API: MoodSync cannot enumerate a user's Echo units or Alexa-connected
 * smart devices, and never claims to. What's real, and all this list
 * represents, is the set of spoken commands the skill answers. */
export const ALEXA_VOICE_COMMANDS = [
  "how I'm doing today",
  "my sleep summary",
  "to sync my devices",
  "to start a relaxation session",
  "to improve my focus",
  "to activate my evening routine",
  "if my house is secure",
] as const;
