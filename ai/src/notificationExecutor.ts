import { notificationRepository } from '@moodsync/database';

export interface CreateNotificationInput {
  userId: string;
  title: string;
  body: string;
  ruleId?: string | undefined;
}

/**
 * The notification engine — real, closing the `notification.*` action
 * gap noted in shared/src/automation.ts (modeled, never executed). Unlike
 * a rule action, a notification isn't something a rule opts into; it's a
 * side effect of every dispatch outcome (see ai/src/dispatch.ts), so a
 * user always sees *why* an automation did or didn't fire, not just that
 * something happened. `title`/`body` are pre-built by the caller (usually
 * from ai/src/explain.ts) rather than derived here, keeping this module a
 * thin, testable persistence wrapper.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  await notificationRepository.create({
    userId: input.userId,
    title: input.title,
    body: input.body,
    ruleId: input.ruleId,
  });
}
