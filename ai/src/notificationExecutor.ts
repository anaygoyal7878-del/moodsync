import { notificationRepository, userPreferencesRepository } from '@moodsync/database';
import { withinTimeWindow } from './ruleEngine.js';

export interface CreateNotificationInput {
  userId: string;
  title: string;
  body: string;
  ruleId?: string | undefined;
}

/**
 * Quiet-hours / on-off check — `UserPreferences.notificationsEnabled`
 * and `quietHoursStart`/`quietHoursEnd` were modeled in the schema since
 * before this round but never read by any code. Reuses
 * `ruleEngine.ts`'s `withinTimeWindow` (same "HH:mm", same
 * overnight-wrap handling) rather than a second time-window
 * implementation. A user with `notificationsEnabled: false` never gets
 * notifications, regardless of quiet hours; a user with quiet hours set
 * gets them suppressed only inside that window.
 *
 * Deliberately suppresses only the *notification* — the
 * `AutomationExecutionLog` row (with its `reason` text) is always
 * written regardless, so the audit trail/dashboard history is never
 * affected by notification preferences, only what interrupts the user.
 */
export async function shouldNotify(userId: string, now: Date = new Date()): Promise<boolean> {
  const prefs = await userPreferencesRepository.getNotificationPreferences(userId);
  if (!prefs.notificationsEnabled) return false;
  if (prefs.quietHoursStart && prefs.quietHoursEnd) {
    if (withinTimeWindow({ start: prefs.quietHoursStart, end: prefs.quietHoursEnd }, now)) return false;
  }
  return true;
}

/**
 * The notification engine — real, closing the `notification.*` action
 * gap noted in shared/src/automation.ts (modeled, never executed). Unlike
 * a rule action, a notification isn't something a rule opts into; it's a
 * side effect of every dispatch outcome (see ai/src/dispatch.ts), so a
 * user always sees *why* an automation did or didn't fire, not just that
 * something happened. `title`/`body` are pre-built by the caller (usually
 * from ai/src/explain.ts) rather than derived here, keeping this module a
 * thin, testable persistence wrapper. Callers should check `shouldNotify`
 * first — this function itself doesn't, so tests/callers that want an
 * unconditional write (there are none today) still can.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  await notificationRepository.create({
    userId: input.userId,
    title: input.title,
    body: input.body,
    ruleId: input.ruleId,
  });
}
