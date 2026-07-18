import {
  automationRuleRepository,
  automationExecutionLogRepository,
  userPreferencesRepository,
  resourcePauseRepository,
  biometricReadingRepository,
  userTimezoneRepository,
} from '@moodsync/database';
import type { AutomationRuleDefinition, NormalizedBiometricReading } from '@moodsync/shared';
import { evaluateRules } from './ruleEngine.js';
import { isWithinCooldown } from './cooldown.js';
import { executeAction } from './actionExecutors.js';
import { explainTrigger, explainConflict, explainManualPause, explainRateLimit, explainResourcePause } from './explain.js';
import { deliverNotification } from './notificationExecutor.js';
import { computeWellnessScores } from './wellness.js';

/** Trailing window used to compute wellness scores' own-baseline
 * comparisons (see ai/src/wellness.ts) — same 30-day window the
 * dashboard's `/api/wellness` endpoint uses, so a rule's `wellness.*`
 * condition sees the same score a user sees on their dashboard. */
const WELLNESS_HISTORY_DAYS = 30;

export type DispatchOutcome =
  | 'EXECUTED'
  | 'SKIPPED_COOLDOWN'
  | 'SKIPPED_CONFLICT'
  | 'SKIPPED_MANUAL_PAUSE'
  | 'SKIPPED_SAFETY_RATE_LIMIT'
  | 'QUEUED_FOR_DEVICE'
  | 'FAILED';

export interface DispatchResult {
  ruleId: string;
  ruleName: string;
  outcome: DispatchOutcome;
  reason?: string;
  failureReason?: string;
}

/** A per-user hourly ceiling on *successful* automation executions — a
 * real safety check, not a user preference: it exists to stop a
 * misconfigured or bouncing rule set from hammering a user's smart-home
 * devices, independent of whether they've set generous cooldowns. See
 * docs/DECISION_ENGINE_ARCHITECTURE.md's safety-checks section. */
const RATE_LIMIT_PER_HOUR = 20;

/** Derives a coarse "what does this action actually control" key so two
 * rules that both fire in the same dispatch pass and both, say, set Hue
 * brightness are recognized as conflicting — while a brightness rule and
 * an unrelated Spotify rule are not. Deliberately coarse (provider +
 * action type, not per-device/per-playlist) for v1 — see
 * docs/DECISION_ENGINE_ROADMAP.md for finer-grained resource keys as a
 * follow-up. */
export function resourceKeyFor(action: AutomationRuleDefinition['actions'][number]): string {
  const shortType = action.type.split('.')[1] ?? action.type;
  return `${action.provider}:${shortType}`;
}

/** Given every rule matched in this dispatch pass, resolves same-resource
 * conflicts by keeping only the highest-priority rule per resource key
 * (ties broken by rule id for determinism) — see `resourceKeyFor`. Rules
 * that share no resource with any other matched rule are always kept. */
export function resolveConflicts(matched: AutomationRuleDefinition[]): {
  winners: AutomationRuleDefinition[];
  losers: Array<{ rule: AutomationRuleDefinition; winner: AutomationRuleDefinition; resourceKey: string }>;
} {
  const byResource = new Map<string, AutomationRuleDefinition[]>();
  for (const rule of matched) {
    for (const action of rule.actions) {
      const key = resourceKeyFor(action);
      const list = byResource.get(key) ?? [];
      if (!list.includes(rule)) list.push(rule);
      byResource.set(key, list);
    }
  }

  const losers: Array<{ rule: AutomationRuleDefinition; winner: AutomationRuleDefinition; resourceKey: string }> = [];
  const loserIds = new Set<string>();
  for (const [resourceKey, rules] of byResource) {
    if (rules.length < 2) continue;
    const sorted = [...rules].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    const winner = sorted[0];
    if (!winner) continue;
    for (const rule of rules) {
      if (rule.id === winner.id) continue;
      losers.push({ rule, winner, resourceKey });
      loserIds.add(rule.id);
    }
  }

  return { winners: matched.filter((r) => !loserIds.has(r.id)), losers };
}

async function recordAndNotify(params: {
  userId: string;
  rule: AutomationRuleDefinition;
  readingId: string | undefined;
  outcome: DispatchOutcome;
  reason: string;
  failureReason?: string;
  notifyTitle: string;
  now: Date;
}): Promise<void> {
  await automationExecutionLogRepository.record({
    userId: params.userId,
    ruleId: params.rule.id,
    triggerReadingId: params.readingId,
    outcome: params.outcome,
    reason: params.reason,
    ...(params.failureReason !== undefined ? { failureReason: params.failureReason } : {}),
  });
  // The audit trail above is always written regardless of notification
  // preferences — only the interruptive notification is gated on
  // quiet-hours/on-off/digest-mode (deliverNotification) and this rule's
  // own opt-off (rule.notificationsEnabled, undefined treated as enabled
  // for rules created before this field existed).
  if (params.rule.notificationsEnabled !== false) {
    await deliverNotification(
      { userId: params.userId, title: params.notifyTitle, body: params.reason, ruleId: params.rule.id },
      params.now,
    );
  }
}

/**
 * The core product loop: given one new biometric reading (or, for a
 * schedule-only rule, a tick with no fresh biometric data — see
 * workers/src/scheduledDispatch.ts), find every enabled rule it matches,
 * apply manual-pause / conflict-resolution / cooldown / safety-rate-limit
 * checks in that order, execute what's left, and record every outcome
 * (including skips and failures, never just successes) with a
 * human-readable explanation to both `AutomationExecutionLog` and a
 * persisted `Notification` — see docs/DECISION_ENGINE_ARCHITECTURE.md.
 * Called from the backend's manual "sync now" endpoint, every wearable
 * sync worker, and the scheduled-tick worker.
 */
export async function dispatchForReading(
  reading: NormalizedBiometricReading,
  readingId?: string,
  now: Date = new Date(),
): Promise<DispatchResult[]> {
  const userId = reading.userId;
  const results: DispatchResult[] = [];

  const rules = await automationRuleRepository.listEnabledForUser(userId);

  // Only fetch history and compute wellness scores when some enabled
  // rule actually references one — the common case (biometric-only
  // rules) skips this extra DB round-trip entirely.
  const needsWellnessScores = rules.some((rule) => rule.conditions.some((c) => c.field.startsWith('wellness.')));
  const wellnessScores = needsWellnessScores
    ? computeWellnessScores(reading, (await biometricReadingRepository.listRecentNormalized(userId, WELLNESS_HISTORY_DAYS)).filter((r) => r.timestamp !== reading.timestamp))
    : undefined;

  // Only fetch the user's timezone when some enabled rule actually has a
  // timeWindow — biometric-only rules (the common case) never consult it.
  const needsTimezone = rules.some((rule) => rule.timeWindow != null);
  const timezone = needsTimezone ? await userTimezoneRepository.getTimezone(userId) : 'UTC';

  const matched = evaluateRules(rules, reading, now, wellnessScores, timezone);
  if (matched.length === 0) return results;

  const pausedUntil = await userPreferencesRepository.getAutomationsPausedUntil(userId);
  if (pausedUntil && pausedUntil.getTime() > now.getTime()) {
    const reason = explainManualPause(pausedUntil.toISOString());
    for (const rule of matched) {
      await recordAndNotify({
        userId,
        rule,
        readingId,
        outcome: 'SKIPPED_MANUAL_PAUSE',
        reason,
        notifyTitle: 'Automation paused',
        now,
      });
      results.push({ ruleId: rule.id, ruleName: rule.name, outcome: 'SKIPPED_MANUAL_PAUSE', reason });
    }
    return results;
  }

  const { winners, losers } = resolveConflicts(matched);
  for (const { rule, winner, resourceKey } of losers) {
    const reason = explainConflict(rule, winner, resourceKey);
    await recordAndNotify({ userId, rule, readingId, outcome: 'SKIPPED_CONFLICT', reason, notifyTitle: 'Automation skipped (conflict)', now });
    results.push({ ruleId: rule.id, ruleName: rule.name, outcome: 'SKIPPED_CONFLICT', reason });
  }

  let executedThisPass = 0;
  const executedInLastHour = await automationExecutionLogRepository.countExecutedSince(userId, new Date(now.getTime() - 60 * 60_000));

  // Per-provider manual overrides (e.g. "pause my lights"), alongside the
  // global automationsPausedUntil check above — fetched once per dispatch
  // pass, keyed by provider (ResourcePause.resourceKey), same shape as
  // executedInLastHour.
  const resourcePauses = await resourcePauseRepository.listActiveForUser(userId, now);

  for (const rule of winners) {
    const lastExecutedAt = await automationExecutionLogRepository.findLastExecutedAt(rule.id);
    if (isWithinCooldown(lastExecutedAt, rule.cooldownMinutes, now)) {
      await automationExecutionLogRepository.record({ userId, ruleId: rule.id, triggerReadingId: readingId, outcome: 'SKIPPED_COOLDOWN' });
      results.push({ ruleId: rule.id, ruleName: rule.name, outcome: 'SKIPPED_COOLDOWN' });
      continue;
    }

    if (executedInLastHour + executedThisPass >= RATE_LIMIT_PER_HOUR) {
      const reason = explainRateLimit(rule, RATE_LIMIT_PER_HOUR);
      await recordAndNotify({ userId, rule, readingId, outcome: 'SKIPPED_SAFETY_RATE_LIMIT', reason, notifyTitle: 'Automation skipped (safety limit)', now });
      results.push({ ruleId: rule.id, ruleName: rule.name, outcome: 'SKIPPED_SAFETY_RATE_LIMIT', reason });
      continue;
    }

    const reason = explainTrigger(rule, reading, wellnessScores);
    try {
      let anyQueued = false;
      let anyExecuted = false;
      const skippedProviders: string[] = [];
      for (const action of rule.actions) {
        const pausedUntil = resourcePauses.get(action.provider);
        if (pausedUntil) {
          skippedProviders.push(action.provider);
          continue;
        }
        const { queued } = await executeAction(userId, action, rule.id);
        if (queued) anyQueued = true;
        else anyExecuted = true;
      }

      // Every action this rule would take targets a currently-paused
      // provider — same SKIPPED_MANUAL_PAUSE outcome as the global pause
      // above, scoped to the specific provider(s) paused. A rule with
      // some actions on a paused provider and others on an unpaused one
      // still executes the unpaused ones (outcome EXECUTED below) —
      // sibling actions on a different provider aren't held hostage by
      // one paused resource.
      if (!anyQueued && !anyExecuted) {
        const firstPausedProvider = skippedProviders[0]!;
        const pauseReason = explainResourcePause(firstPausedProvider, resourcePauses.get(firstPausedProvider)!.toISOString());
        await recordAndNotify({ userId, rule, readingId, outcome: 'SKIPPED_MANUAL_PAUSE', reason: pauseReason, notifyTitle: 'Automation paused', now });
        results.push({ ruleId: rule.id, ruleName: rule.name, outcome: 'SKIPPED_MANUAL_PAUSE', reason: pauseReason });
        continue;
      }

      const outcome = anyQueued ? 'QUEUED_FOR_DEVICE' : 'EXECUTED';
      const notifyTitle = anyQueued ? `${rule.name} queued for your device` : `${rule.name} triggered`;
      await recordAndNotify({ userId, rule, readingId, outcome, reason, notifyTitle, now });
      results.push({ ruleId: rule.id, ruleName: rule.name, outcome, reason });
      executedThisPass++;
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : String(error);
      await recordAndNotify({
        userId,
        rule,
        readingId,
        outcome: 'FAILED',
        reason,
        failureReason,
        notifyTitle: `${rule.name} failed`,
        now,
      });
      results.push({ ruleId: rule.id, ruleName: rule.name, outcome: 'FAILED', reason, failureReason });
    }
  }

  return results;
}
