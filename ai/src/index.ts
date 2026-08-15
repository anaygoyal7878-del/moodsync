export { evaluateRule, evaluateRules, withinTimeWindow } from './ruleEngine.js';
export { isWithinCooldown } from './cooldown.js';
export { dispatchForReading, dispatchForLocationEvent, type DispatchResult } from './dispatch.js';
export {
  executeHueAction,
  setAllHueLights,
  listHueLightsForUser,
  listHueScenesForUser,
  setHueLightByName,
  activateHueSceneByName,
} from './hueActionExecutor.js';
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
export { computeWalkingStreak, computeMeditationStreak, computeFocusStreak, type HabitStreakResult } from './habits.js';
export {
  checkRecoveryUnusuallyHigh,
  checkRoomTemperatureOutsideSleepRange,
  checkSceneTimeOfDayPattern,
  checkBurnoutRisk,
  checkHabitStreakMilestone,
  checkSocialBatteryLow,
  checkRecentStressSpike,
  type ProactiveNotificationCandidate,
  type RoomTemperatureCheckInput,
  type SceneRunEvent,
  type BurnoutRiskInput,
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
export { sendAtlasMessage, buildAtlasSystemPrompt, AtlasNotConfiguredError, type AtlasChatMessage } from './atlasChat.js';
export { computeLiveEnergyMeter, type CaffeineLogInput, type LiveEnergyMeter } from './energyMeter.js';
export { computeFocusSessionScore } from './focusScore.js';
export {
  computeMusicOutcome,
  computeNextNightOutcome,
  confidenceLabel,
  modeWantsLowerHeartRate,
  musicModeLabel,
  type HeartRateSample as MusicHeartRateSample,
  type MusicExplanation,
  type MusicMode,
  type MusicOutcome,
  type MusicOutcomeConfidence,
  type MusicSessionWindow,
  type NextNightInput,
} from './musicFeedback.js';
export { describeActiveState, journeyLabel, type ActiveState, type ActiveStateInput } from './moodLanguage.js';
export {
  rankPlaylistsByEffect,
  rankGenresByEffect,
  bestHoursForMode,
  buildMusicRecommendations,
  compareFocusDuration,
  describeFocusDuration,
  type CompletedMusicSession,
  type FocusDurationComparison,
  type HourPattern,
  type MusicEffectiveness,
  type MusicRecommendation,
} from './musicMemory.js';
export {
  computeFreeBlocks,
  computeStudyWindowSuggestion,
  type BusyBlock,
  type StudyWindowSuggestion,
} from './studyPlanner.js';
export {
  computeSocialBattery,
  socialBatteryGuidance,
  type SocialBatteryInput,
  type SocialBatteryLevel,
  type SocialBatteryResult,
} from './socialBattery.js';
export {
  computeStressTimeline,
  describeTimelineEntry,
  type HeartRateSample,
  type StressShiftDirection,
  type StressTimelineEntry,
  type TimelineContextEvent,
} from './stressTimeline.js';
export { suggestSmartBreak, type BreakKind, type BreakSuggestion, type SmartBreakInput } from './smartBreaks.js';
export {
  computeBedtimeTarget,
  buildWindDownRoutine,
  summarizeSleepQuality,
  type BedtimeTarget,
  type SleepNight,
  type SleepQualitySummary,
  type WindDownInput,
  type WindDownStep,
  type WindDownStepKind,
} from './sleepCoach.js';
export {
  correlateOccurrences,
  computeBestFocusHours,
  describeFinding,
  type HourlyPerformance,
  type MemoryFinding,
  type MetricPoint,
  type ScoredSession,
  type TimedOccurrence,
} from './wellnessMemory.js';
export {
  composeDailyBrief,
  computeOvernightChanges,
  computeReadiness,
  greetingFor,
  readinessBand,
  timeOfDayFor,
  type BriefAction,
  type BriefActionKind,
  type DailyBrief,
  type DailyBriefInput,
  type OvernightChange,
  type ReadinessBand,
  type TimeOfDay,
} from './dailyBrief.js';
export {
  classifyInbound,
  deterministicReply,
  buildStatusReply,
  shapeReply,
  CRISIS_REPLY,
  STOP_REPLY,
  START_REPLY,
  HELP_REPLY,
  UNVERIFIED_REPLY,
  OPTED_OUT_REPLY,
  MESSAGING_STYLE_PROMPT,
  MAX_REPLY_CHARS,
  type InboundClassification,
  type InboundIntent,
  type StatusSnapshot,
} from './messagingAgent.js';
export { buildCaffeineLogReply, buildProactiveNudge } from './messagingAgent.js';
export { sendProactiveInsight } from './messagingDelivery.js';
export { getTodayCalendarLoad, type TodayCalendarLoad } from './calendarSignal.js';

// --- Adaptive Environment Intelligence Engine ---
// See docs/ADAPTIVE_ENVIRONMENT_ARCHITECTURE.md.
export {
  computePersonalBaselines,
  compareToBaseline,
  describeBaseline,
  MIN_SAMPLES_FOR_BASELINE,
  type BaselineComparison,
  type PersonalBaselines,
} from './personalBaselines.js';
export {
  assessState,
  STATE_LABELS,
  MEDICAL_DISCLAIMER,
  MIN_SAMPLES_FOR_CONFIDENT_STATE,
  type MoodState,
  type StateAssessment,
  type StateEngineInput,
  type SupportingSignal,
} from './stateEngine.js';
export {
  composeEnvironment,
  DEFAULT_MAX_LIGHTING_DELTA_PCT,
  DEFAULT_MAX_TEMPERATURE_DELTA_C,
  MIN_AUTOMATED_BRIGHTNESS_PCT,
  type ActuationMode,
  type AvailableLight,
  type AvailableScene,
  type ComposerPreferences,
  type EnvironmentCapabilities,
  type EnvironmentChannel,
  type EnvironmentProposal,
  type ProposedChange,
} from './environmentComposer.js';
export {
  canAutomate,
  canSuggest,
  executableChanges,
  AUTOMATION_COOLDOWN_MINUTES,
  MIN_STATE_DURATION_MINUTES,
  MIN_CONFIDENCE_TO_ACT,
  MANUAL_OVERRIDE_RESPECT_MINUTES,
  type AutomationLevel,
  type GuardDecision,
  type GuardInput,
  type GuardBlockReason,
} from './environmentGuards.js';
export { sendAgenticMessage, type AgenticReply, type AgenticReplyAction } from './agenticMessaging.js';
export { executeConfirmedAction } from './messagingTools.js';
