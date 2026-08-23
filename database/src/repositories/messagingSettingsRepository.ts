import { prisma } from '../prismaClient.js';

export interface MessagingSettings {
  proactiveEnabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  dailyProactiveLimit: number;
  recurringNudgesEnabled: boolean;
  recurringNudgeIntervalHours: number;
  lastRecurringNudgeAt: Date | null;
  lastRecurringNudgeKind: string | null;
}

/**
 * Defaults for a user who has never opened the settings screen.
 *
 * `proactiveEnabled: true` matches the behaviour that already shipped —
 * see the schema comment on `MessagingSettings`. Defaulting it off here
 * would silently disable a live feature the moment this row type
 * existed, which is a behaviour change disguised as a default.
 *
 * `recurringNudgesEnabled: false` is the opposite call for the opposite
 * reason: this is a brand-new way for MoodSync to start texting
 * someone (Poke's "remind me to drink water every two hours" pattern),
 * so the conservative default is off — a row's existence must not
 * silently start a new kind of unprompted message.
 */
export const DEFAULT_MESSAGING_SETTINGS: MessagingSettings = {
  proactiveEnabled: true,
  quietHoursStart: null,
  quietHoursEnd: null,
  dailyProactiveLimit: 3,
  recurringNudgesEnabled: false,
  recurringNudgeIntervalHours: 3,
  lastRecurringNudgeAt: null,
  lastRecurringNudgeKind: null,
};

export const messagingSettingsRepository = {
  /** Never returns null — an absent row means "the defaults", not "no
   * policy", so every caller gets an answer it can act on. */
  async get(userId: string): Promise<MessagingSettings> {
    const row = await prisma.messagingSettings.findUnique({ where: { userId } });
    if (!row) return { ...DEFAULT_MESSAGING_SETTINGS };
    return {
      proactiveEnabled: row.proactiveEnabled,
      quietHoursStart: row.quietHoursStart,
      quietHoursEnd: row.quietHoursEnd,
      dailyProactiveLimit: row.dailyProactiveLimit,
      recurringNudgesEnabled: row.recurringNudgesEnabled,
      recurringNudgeIntervalHours: row.recurringNudgeIntervalHours,
      lastRecurringNudgeAt: row.lastRecurringNudgeAt,
      lastRecurringNudgeKind: row.lastRecurringNudgeKind,
    };
  },

  /**
   * Partial update. Keys explicitly set to `undefined` are stripped
   * rather than written, so a PATCH that omits a field leaves it alone
   * instead of nulling it — same `exactOptionalPropertyTypes`-driven
   * shape as environmentRepository.updateSettings. `lastRecurringNudgeAt`/
   * `Kind` are deliberately excluded from the patchable type below —
   * those are worker-written state, not a user preference; see
   * `recordRecurringNudgeSent`.
   */
  async update(
    userId: string,
    patch: {
      [K in Exclude<keyof MessagingSettings, 'lastRecurringNudgeAt' | 'lastRecurringNudgeKind'>]?:
        | MessagingSettings[K]
        | undefined;
    },
  ): Promise<void> {
    const data = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    await prisma.messagingSettings.upsert({
      where: { userId },
      update: data,
      create: { userId, ...DEFAULT_MESSAGING_SETTINGS, ...data },
    });
  },

  /** Every user with recurring nudges turned on — the worker's entry
   * point. Deliberately separate from the biometric-reading-driven user
   * list the rest of the proactive worker iterates: a recurring nudge
   * needs no signal at all, so it must not be gated on having recent
   * wearable data. */
  async listUserIdsWithRecurringNudgesEnabled(): Promise<string[]> {
    const rows = await prisma.messagingSettings.findMany({
      where: { recurringNudgesEnabled: true },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  },

  /** Records that a recurring nudge of `kind` went out, advancing the
   * rotation and the interval clock together so both stay consistent. */
  async recordRecurringNudgeSent(userId: string, kind: string, at: Date): Promise<void> {
    await prisma.messagingSettings.upsert({
      where: { userId },
      update: { lastRecurringNudgeAt: at, lastRecurringNudgeKind: kind },
      create: { userId, ...DEFAULT_MESSAGING_SETTINGS, lastRecurringNudgeAt: at, lastRecurringNudgeKind: kind },
    });
  },
};
