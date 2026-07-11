import { automationRuleRepository, automationExecutionLogRepository } from '@moodsync/database';
import type { NormalizedBiometricReading } from '@moodsync/shared';
import { evaluateRules } from './ruleEngine.js';
import { isWithinCooldown } from './cooldown.js';
import { executeHueAction } from './hueActionExecutor.js';
import { executeSpotifyAction } from './spotifyActionExecutor.js';

export interface DispatchResult {
  ruleId: string;
  ruleName: string;
  outcome: 'EXECUTED' | 'SKIPPED_COOLDOWN' | 'FAILED';
  failureReason?: string;
}

/**
 * The core product loop: given one new biometric reading, find every
 * enabled rule it matches, skip any still in cooldown, execute the rest,
 * and record every outcome (including skips and failures — not just
 * successes) to `AutomationExecutionLog` for the dashboard's automation
 * history. Called from both the backend's manual "sync now" endpoint and
 * the standalone WHOOP sync worker, right after new readings are inserted.
 */
export async function dispatchForReading(
  reading: NormalizedBiometricReading,
  readingId?: string,
): Promise<DispatchResult[]> {
  const rules = await automationRuleRepository.listEnabledForUser(reading.userId);
  const matching = evaluateRules(rules, reading);
  const results: DispatchResult[] = [];

  for (const rule of matching) {
    const lastExecutedAt = await automationExecutionLogRepository.findLastExecutedAt(rule.id);
    if (isWithinCooldown(lastExecutedAt, rule.cooldownMinutes)) {
      await automationExecutionLogRepository.record({
        userId: reading.userId,
        ruleId: rule.id,
        triggerReadingId: readingId,
        outcome: 'SKIPPED_COOLDOWN',
      });
      results.push({ ruleId: rule.id, ruleName: rule.name, outcome: 'SKIPPED_COOLDOWN' });
      continue;
    }

    try {
      for (const action of rule.actions) {
        if (action.provider === 'hue') {
          await executeHueAction(reading.userId, action);
        } else if (action.provider === 'spotify') {
          await executeSpotifyAction(reading.userId, action);
        } else {
          // Notification actions aren't implemented yet — fail loudly
          // rather than silently no-op, so a user who configured one
          // sees it in their automation history instead of wondering why
          // nothing happened.
          throw new Error(`Provider "${action.provider}" automation dispatch is not yet implemented`);
        }
      }
      await automationExecutionLogRepository.record({
        userId: reading.userId,
        ruleId: rule.id,
        triggerReadingId: readingId,
        outcome: 'EXECUTED',
      });
      results.push({ ruleId: rule.id, ruleName: rule.name, outcome: 'EXECUTED' });
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : String(error);
      await automationExecutionLogRepository.record({
        userId: reading.userId,
        ruleId: rule.id,
        triggerReadingId: readingId,
        outcome: 'FAILED',
        failureReason,
      });
      results.push({ ruleId: rule.id, ruleName: rule.name, outcome: 'FAILED', failureReason });
    }
  }

  return results;
}
