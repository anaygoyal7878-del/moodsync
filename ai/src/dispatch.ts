import {
  automationRuleRepository,
  automationExecutionLogRepository,
  userPreferencesRepository,
} from '@moodsync/database';
import type { AutomationRuleDefinition, NormalizedBiometricReading } from '@moodsync/shared';
import { evaluateRules } from './ruleEngine.js';
import { isWithinCooldown } from './cooldown.js';
import { executeHueAction } from './hueActionExecutor.js';
import { executeSpotifyAction } from './spotifyActionExecutor.js';
import { explainTrigger, explainConflict, explainManualPause, explainRateLimit } from './explain.js';
import { createNotification } from './notificationExecutor.js';

export type DispatchOutcome =
  | 'EXECUTED'
  | 'SKIPPED_COOLDOWN'
  | 'SKIPPED_CONFLICT'
  | 'SKIPPED_MANUAL_PAUSE'
  | 'SKIPPED_SAFETY_RATE_LIMIT'
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
}): Promise<void> {
  await automationExecutionLogRepository.record({
    userId: params.userId,
    ruleId: params.rule.id,
    triggerReadingId: params.readingId,
    outcome: params.outcome,
    reason: params.reason,
    ...(params.failureReason !== undefined ? { failureReason: params.failureReason } : {}),
  });
  await createNotification({
    userId: params.userId,
    title: params.notifyTitle,
    body: params.reason,
    ruleId: params.rule.id,
  });
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
  const matched = evaluateRules(rules, reading, now);
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
      });
      results.push({ ruleId: rule.id, ruleName: rule.name, outcome: 'SKIPPED_MANUAL_PAUSE', reason });
    }
    return results;
  }

  const { winners, losers } = resolveConflicts(matched);
  for (const { rule, winner, resourceKey } of losers) {
    const reason = explainConflict(rule, winner, resourceKey);
    await recordAndNotify({ userId, rule, readingId, outcome: 'SKIPPED_CONFLICT', reason, notifyTitle: 'Automation skipped (conflict)' });
    results.push({ ruleId: rule.id, ruleName: rule.name, outcome: 'SKIPPED_CONFLICT', reason });
  }

  let executedThisPass = 0;
  const executedInLastHour = await automationExecutionLogRepository.countExecutedSince(userId, new Date(now.getTime() - 60 * 60_000));

  for (const rule of winners) {
    const lastExecutedAt = await automationExecutionLogRepository.findLastExecutedAt(rule.id);
    if (isWithinCooldown(lastExecutedAt, rule.cooldownMinutes, now)) {
      await automationExecutionLogRepository.record({ userId, ruleId: rule.id, triggerReadingId: readingId, outcome: 'SKIPPED_COOLDOWN' });
      results.push({ ruleId: rule.id, ruleName: rule.name, outcome: 'SKIPPED_COOLDOWN' });
      continue;
    }

    if (executedInLastHour + executedThisPass >= RATE_LIMIT_PER_HOUR) {
      const reason = explainRateLimit(rule, RATE_LIMIT_PER_HOUR);
      await recordAndNotify({ userId, rule, readingId, outcome: 'SKIPPED_SAFETY_RATE_LIMIT', reason, notifyTitle: 'Automation skipped (safety limit)' });
      results.push({ ruleId: rule.id, ruleName: rule.name, outcome: 'SKIPPED_SAFETY_RATE_LIMIT', reason });
      continue;
    }

    const reason = explainTrigger(rule, reading);
    try {
      for (const action of rule.actions) {
        if (action.provider === 'hue') {
          await executeHueAction(userId, action);
        } else if (action.provider === 'spotify') {
          await executeSpotifyAction(userId, action);
        } else {
          // Notification-provider actions aren't a separate executor —
          // every outcome already generates a notification (see
          // recordAndNotify) — fail loudly for any other unimplemented
          // provider so a misconfigured rule shows up in history instead
          // of silently no-opping.
          throw new Error(`Provider "${action.provider}" automation dispatch is not yet implemented`);
        }
      }
      await recordAndNotify({ userId, rule, readingId, outcome: 'EXECUTED', reason, notifyTitle: `${rule.name} triggered` });
      results.push({ ruleId: rule.id, ruleName: rule.name, outcome: 'EXECUTED', reason });
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
      });
      results.push({ ruleId: rule.id, ruleName: rule.name, outcome: 'FAILED', reason, failureReason });
    }
  }

  return results;
}
