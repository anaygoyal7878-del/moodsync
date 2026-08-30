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
/** The provider-agnostic action registry. Exported so the Adaptive
 * Environment engine dispatches accepted changes through the *same*
 * executors automation rules already use, rather than a parallel path
 * that could drift from them. */
export { executeAction, type ActionExecutionResult } from './actionExecutors.js';
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
  checkRecoveryEnvironmentConjunction,
  type ProactiveNotificationCandidate,
  type RoomTemperatureCheckInput,
  type SceneRunEvent,
  type BurnoutRiskInput,
  type RecoveryEnvironmentInput,
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
export { sendClaraMessage, buildClaraSystemPrompt, ClaraNotConfiguredError, type ClaraChatMessage } from './claraChat.js';
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
  rankRecoveryActions,
  type RecoveryAction,
  type RecoveryActionInput,
  type RecoveryActionKind,
} from './recoveryActions.js';
export {
  detectHealthScenarios,
  type HealthScenario,
  type HealthScenarioId,
  type ScenarioSeverity,
} from './healthScenarios.js';
export {
  buildIntelligenceStack,
  describeStackForPrompt,
  type IntelligenceStackResult,
  type IntelligenceLayer,
  type LayerId,
} from './intelligenceStack.js';
export { loadIntelligenceStack } from './intelligenceContext.js';
export {
  CLARA_GENERATION_CONFIG,
  CLARA_SAFETY_SETTINGS,
  interpretGeminiResponse,
  outcomeToText,
  type GeminiOutcome,
} from './geminiConfig.js';
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
  CAFFEINE_DRINK_PRESETS,
  type InboundClassification,
  type InboundIntent,
  type StatusSnapshot,
} from './messagingAgent.js';
export { buildCaffeineLogReply, buildProactiveNudge } from './messagingAgent.js';
export { sendProactiveInsight } from './messagingDelivery.js';
export {
  getTodayCalendarLoad,
  isInMeetingNow,
  computeLoadFromWindows,
  isMeetingAt,
  type TodayCalendarLoad,
} from './calendarSignal.js';

// --- Affect model: learning how biometrics relate to self-reported mood ---
// See docs/AFFECT_MODEL_ARCHITECTURE.md.
export {
  learnAffectModel,
  predictAffect,
  describeAssociation,
  crossValidatedR2,
  selectFeatures,
  fitRidge,
  pearson,
  AFFECT_SCALE_MIN,
  AFFECT_SCALE_MAX,
  MIN_SAMPLES_TO_LEARN,
  MIN_USABLE_R2,
  SAMPLES_PER_FEATURE,
  type AffectModel,
  type AffectTarget,
  type FeatureAssociation,
  type LabeledSample,
} from './affectModel.js';
export {
  extractFeatures,
  readingForMoment,
  usableFeatures,
  featureLabel,
  FEATURE_LABELS,
  FEATURE_WINDOW_MINUTES,
} from './affectFeatures.js';
export {
  learnAffect,
  buildSamples,
  learningStatus,
  type AffectLearning,
  type CheckInRecord,
} from './affectTraining.js';
export {
  transcribeVoiceMessage,
  isSupportedAudioMimeType,
  SUPPORTED_AUDIO_MIME_TYPES,
  TranscriptionError,
} from './voiceTranscription.js';
export {
  nextNudgeKind,
  isRecurringNudgeDue,
  NUDGE_CONTENT,
  type NudgeKind,
} from './recurringNudge.js';
export {
  calibrateStateConfidence,
  applyCalibration,
  AGREEMENT_THRESHOLD,
  DISAGREEMENT_THRESHOLD,
  AGREEMENT_MULTIPLIER,
  DISAGREEMENT_MULTIPLIER,
  MAX_CALIBRATED_CONFIDENCE,
  type AffectAgreement,
  type AffectCalibration,
} from './affectCalibration.js';

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
export {
  SCENTS,
  ALL_SCENTS,
  PULSE_POINTS,
  APPLICATION_RULES,
  NOTE_TIMING,
  MAX_PULSE_POINTS,
  type PulsePoint,
  type PulsePointInfo,
  type Scent,
  type ScentCharacter,
  type ScentId,
  type ScentNotes,
} from './scentLibrary.js';
export {
  recommendScent,
  OCCASION_LABELS,
  type Occasion,
  type ScentRecommendation,
  type ScentRecommendationInput,
} from './scentIntelligence.js';
export {
  resolveMusicPlaylist,
  pickProvenPlaylist,
  type ResolvedPlaylist,
} from './musicResolver.js';
export {
  computeStateHeldMinutes,
  MAX_OBSERVATION_GAP_MINUTES,
  type StateObservationRecord,
} from './stateHistory.js';
export {
  computeEnvironmentAnalytics,
  computeStateFrequency,
  computeAcceptanceOverTime,
  computeOutcomeByState,
  type AcceptancePoint,
  type EnvironmentAnalytics,
  type StateFrequency,
  type StateOutcome,
} from './environmentAnalytics.js';
export {
  computeAcceptance,
  computeEnvironmentEffects,
  describeEffect,
  shouldProposeForState,
  preferredHoursForState,
  MIN_SESSIONS_FOR_FINDING,
  SUPPRESSION_ACCEPTANCE_RATE,
  type EnvironmentEffect,
  type SessionRecord,
  type StateAcceptance,
} from './environmentLearning.js';
export { sendAgenticMessage, type AgenticReply, type AgenticReplyAction, type AgenticContext } from './agenticMessaging.js';
export {
  compileConversationProfile,
  renderProfileBlock,
  rankDeclaredFacts,
  BAND_LABELS,
  MIN_MESSAGES_FOR_TRAITS,
  MIN_BAND_DOMINANCE,
  MIN_INTENT_COUNT,
  PROFILE_BLOCK_BUDGET_CHARS,
  type ActiveBand,
  type ConversationProfile,
  type DeclaredFact,
  type InboundRecord,
  type ProfileTrait,
  type ReplyLength,
} from './messagingProfile.js';
export {
  selectMessagingTools,
  resolveMessagingCapabilities,
  MESSAGING_TOOLS,
  type MessagingCapabilities,
  type MessagingTool,
  type MessagingToolKind,
} from './messagingTools.js';
export { executeConfirmedAction } from './messagingTools.js';
