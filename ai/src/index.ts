export { evaluateRule, evaluateRules, withinTimeWindow } from './ruleEngine.js';
export { isWithinCooldown } from './cooldown.js';
export { dispatchForReading, type DispatchResult } from './dispatch.js';
export { executeHueAction } from './hueActionExecutor.js';
// executeSpotifyAction wasn't previously exported publicly (only used
// internally by dispatch.ts) — the Alexa integration's named-rule voice
// intents (see docs/ALEXA_ARCHITECTURE.md §9) need to run a rule's full
// action list directly, the same way dispatchForReading does, so this
// export was added rather than duplicating the executor.
export { executeSpotifyAction } from './spotifyActionExecutor.js';
export {
  computeTrends,
  computeWellnessTrends,
  computeAutomationEffectiveness,
  type TrendResult,
  type AutomationEffectivenessResult,
} from './insights.js';
export {
  computeWellnessScores,
  computeStressScore,
  computeRecoveryScore,
  computeSleepScore,
  computeEnergyScore,
  type WellnessScore,
  type WellnessScores,
  type ScoreBasis,
} from './wellness.js';
export { explainTrigger, explainConflict, explainManualPause, explainRateLimit } from './explain.js';
export { createNotification, shouldNotify, type CreateNotificationInput } from './notificationExecutor.js';
export { computeWeeklyInsights } from './weeklyReport.js';
export { generateRecommendations, type RecommendationCandidate, type PlaylistSkipStat } from './recommendations.js';
