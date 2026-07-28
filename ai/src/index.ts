export { evaluateRule, evaluateRules, withinTimeWindow } from './ruleEngine.js';
export { isWithinCooldown } from './cooldown.js';
export { dispatchForReading, dispatchForLocationEvent, type DispatchResult } from './dispatch.js';
export { executeHueAction, setAllHueLights } from './hueActionExecutor.js';
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
  computeSceneUsageFrequency,
  type TrendResult,
  type AutomationEffectivenessResult,
  type SceneUsageResult,
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
export { createNotification, shouldNotify, deliverNotification, type CreateNotificationInput } from './notificationExecutor.js';
export { computeWeeklyInsights, computeBiggestImprovement, type BiggestImprovementResult } from './weeklyReport.js';
export { generateRecommendations, type RecommendationCandidate, type PlaylistSkipStat } from './recommendations.js';
export { computeWalkingStreak, computeMeditationStreak, type HabitStreakResult } from './habits.js';
export {
  checkRecoveryUnusuallyHigh,
  checkRoomTemperatureOutsideSleepRange,
  checkSceneTimeOfDayPattern,
  type ProactiveNotificationCandidate,
  type RoomTemperatureCheckInput,
  type SceneRunEvent,
} from './proactiveNotifications.js';
export {
  recommendMusicCategory,
  MUSIC_CATEGORY_KEYWORDS,
  type MusicCategory,
  type MusicRecommendationInput,
  type MusicRecommendationResult,
} from './musicIntelligence.js';
export {
  computeHomeWellnessScore,
  computeOverallHomeWellnessScore,
  type RoomWellnessInput,
  type RoomWellnessResult,
  type HomeScore,
} from './homeWellness.js';
export { sendAtlasMessage, AtlasNotConfiguredError, type AtlasChatMessage } from './atlasChat.js';
