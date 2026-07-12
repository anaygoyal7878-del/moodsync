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
  START_RELAXATION: 'StartRelaxationIntent',
  IMPROVE_FOCUS: 'ImproveFocusIntent',
  ACTIVATE_EVENING_ROUTINE: 'ActivateEveningRoutineIntent',
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
  "You can ask MoodSync how you're doing, for your sleep summary, to sync your devices, " +
  'to start a relaxation session, to improve your focus, or to activate your evening routine.';

export const STOP_SPEECH = 'Okay, goodbye.';

export const FALLBACK_SPEECH =
  "I didn't catch that. You can ask how you're doing, for your sleep summary, or to start a relaxation session.";

export const NOT_LINKED_SPEECH =
  "Your MoodSync account isn't linked yet. Please use the Alexa app to link your account.";
