/**
 * The scheduling system for schedule-triggered automations (Focus Mode,
 * Sleep Preparation — see docs/DECISION_ENGINE_ARCHITECTURE.md). Every
 * other rule fires off a fresh biometric reading (ai/src/dispatch.ts,
 * called from the wearable sync workers); a `timeWindow` rule has no
 * biometric trigger at all, so something has to periodically ask "is it
 * this rule's time yet" independent of any sync. This is that periodic
 * tick — run on the same cron cadence convention as the wearable sync
 * workers (see docs/MILESTONES.md's scheduled-sync entries), e.g. every
 * 5-10 minutes, via `npm run start:scheduled-dispatch -w workers`.
 *
 * Only users with at least one enabled time-window rule are touched, so
 * this doesn't scan every user in the system on every tick.
 */
import { automationRuleRepository, biometricReadingRepository } from '@moodsync/database';
import { dispatchForReading } from '@moodsync/ai';
import type { NormalizedBiometricReading } from '@moodsync/shared';

async function readingForUser(userId: string, now: Date): Promise<{ reading: NormalizedBiometricReading; readingId?: string }> {
  const latest = await biometricReadingRepository.findLatestNormalized(userId);
  if (latest) return { reading: latest.reading, readingId: latest.id };

  // No biometric reading has ever been synced for this user — still
  // valid for a pure time-window rule (empty `conditions`, which never
  // reference a reading field at all), so a synthetic reading with just
  // userId/timestamp is enough for evaluateRules to work correctly. Any
  // rule that also has real biometric conditions simply won't match this
  // synthetic reading, same as it wouldn't match a reading missing that
  // field — see ai/src/ruleEngine.ts's "missing field never matches" rule.
  return {
    reading: { provider: 'apple_health', userId, timestamp: now.toISOString() },
  };
}

const now = new Date();
const userIds = await automationRuleRepository.listUserIdsWithScheduledRules();
console.log(`[scheduled-dispatch] Found ${userIds.length} user(s) with scheduled rules`);

let fired = 0;
let anyFailed = false;
for (const userId of userIds) {
  try {
    const { reading, readingId } = await readingForUser(userId, now);
    const results = await dispatchForReading(reading, readingId, now);
    fired += results.filter((r) => r.outcome === 'EXECUTED').length;
    if (results.length > 0) {
      console.log(`[scheduled-dispatch] user=${userId} results=${results.map((r) => r.outcome).join(',')}`);
    }
  } catch (error) {
    anyFailed = true;
    console.error(`[scheduled-dispatch] user=${userId} failed:`, error instanceof Error ? error.message : error);
  }
}

console.log(`[scheduled-dispatch] Done. ${fired} automation(s) executed across ${userIds.length} user(s).`);
process.exit(anyFailed ? 1 : 0);
