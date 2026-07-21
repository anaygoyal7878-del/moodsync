/**
 * Intent name constants, matching interactionModel.json exactly (kept as
 * a single source of truth so the backend's intent router and the
 * uploaded interaction model can't silently drift apart). The actual
 * handler logic (touching biometricReadingRepository,
 * automationRuleRepository, action executors) lives in
 * backend/src/services/alexaService.ts, not here — this package stays
 * database-free, matching every sibling integration package
 * (integrations/whoop, integrations/hue, etc. never import
 * @moodsync/database either; only backend services do).
 */
export const ALEXA_INTENTS = {
  GET_STATUS: 'GetStatusIntent',
  GET_SLEEP_SUMMARY: 'GetSleepSummaryIntent',
  SYNC_DEVICES: 'SyncDevicesIntent',
  /** A fuller spoken summary than GetStatusIntent — biometrics plus how
   * many automations have run recently — see handleGetReport in
   * alexaService.ts. "Demo report" is one of its sample utterances
   * specifically so a reviewer/demo audience saying that phrase gets a
   * real, data-backed answer rather than a fallback. */
  GET_REPORT: 'GetReportIntent',
  /** Direct device control (not a named-rule replay) — turns every light
   * on the user's Hue connection on/off. See setAllHueLights in
   * ai/src/hueActionExecutor.ts for why this is "all lights" rather than
   * one specific light: Alexa's voice request has no way to pick a
   * `deviceId` without a slot, and CLIP v2 has no group/room resource to
   * target instead. */
  TURN_ON_LIGHTS: 'TurnOnLightsIntent',
  TURN_OFF_LIGHTS: 'TurnOffLightsIntent',
  START_RELAXATION: 'StartRelaxationIntent',
  IMPROVE_FOCUS: 'ImproveFocusIntent',
  ACTIVATE_EVENING_ROUTINE: 'ActivateEveningRoutineIntent',
  /** Voice-driven confirmation loop for Sleep Detection's lock/security
   * check (see docs/DECISION_ENGINE_ROADMAP.md) — Alexa has no cross-skill
   * device-state query API, so this is honest by design: it reports
   * whatever MoodSync itself knows (nothing, today — no lock/security
   * integration exists) rather than querying or claiming device state. */
  CHECK_SECURITY: 'CheckSecurityIntent',
  HELP: 'AMAZON.HelpIntent',
  STOP: 'AMAZON.StopIntent',
  CANCEL: 'AMAZON.CancelIntent',
  FALLBACK: 'AMAZON.FallbackIntent',
} as const;

export type AlexaIntentName = (typeof ALEXA_INTENTS)[keyof typeof ALEXA_INTENTS];

/** The three "named automation rule" intents share the same dispatch
 * shape (find a rule whose name contains a keyword, execute its actions
 * directly) — see docs/ALEXA_ARCHITECTURE.md §9 for why this reuses the
 * user's own configured rules instead of a hardcoded scene. */
export const NAMED_RULE_INTENT_KEYWORDS: Partial<Record<AlexaIntentName, string>> = {
  [ALEXA_INTENTS.START_RELAXATION]: 'relax',
  [ALEXA_INTENTS.IMPROVE_FOCUS]: 'focus',
  [ALEXA_INTENTS.ACTIVATE_EVENING_ROUTINE]: 'evening',
};

export const HELP_SPEECH =
  "You can ask MoodSync how you're doing, for your sleep summary, for a report, to sync your devices, " +
  'to turn your lights on or off, to start a relaxation session, to improve your focus, ' +
  'to activate your evening routine, or if your house is secure.';

/** No lock/security integration exists yet (see
 * docs/DECISION_ENGINE_ROADMAP.md) — this is the honest response, not a
 * guess or a claim of device control/knowledge MoodSync doesn't have. */
export const NO_SECURITY_INTEGRATION_SPEECH =
  "I don't have any smart locks or security systems connected yet, so I can't check that for you — " +
  "you'll want to check them yourself before bed.";

export const STOP_SPEECH = 'Okay, goodbye.';

export const FALLBACK_SPEECH =
  "I didn't catch that. You can ask how you're doing, for your sleep summary, or to start a relaxation session.";

export const NOT_LINKED_SPEECH =
  "Your MoodSync account isn't linked yet. Please use the Alexa app to link your account.";
