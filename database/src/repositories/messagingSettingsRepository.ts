import { prisma } from '../prismaClient.js';

export interface MessagingSettings {
  proactiveEnabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  dailyProactiveLimit: number;
}

/**
 * Defaults for a user who has never opened the settings screen.
 *
 * `proactiveEnabled: true` matches the behaviour that already shipped —
 * see the schema comment on `MessagingSettings`. Defaulting it off here
 * would silently disable a live feature the moment this row type
 * existed, which is a behaviour change disguised as a default.
 */
export const DEFAULT_MESSAGING_SETTINGS: MessagingSettings = {
  proactiveEnabled: true,
  quietHoursStart: null,
  quietHoursEnd: null,
  dailyProactiveLimit: 3,
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
    };
  },

  /**
   * Partial update. Keys explicitly set to `undefined` are stripped
   * rather than written, so a PATCH that omits a field leaves it alone
   * instead of nulling it — same `exactOptionalPropertyTypes`-driven
   * shape as environmentRepository.updateSettings.
   */
  async update(
    userId: string,
    patch: { [K in keyof MessagingSettings]?: MessagingSettings[K] | undefined },
  ): Promise<void> {
    const data = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    await prisma.messagingSettings.upsert({
      where: { userId },
      update: data,
      create: { userId, ...DEFAULT_MESSAGING_SETTINGS, ...data },
    });
  },
};
