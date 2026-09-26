import { prisma } from '../prismaClient.js';

/** `UserPreferences` is a 1:1-with-`User` row created lazily on first
 * write (upsert) rather than at signup — most users never touch it, so
 * there's no reason to force a row into existence for everyone. Reads
 * treat a missing row the same as one with every field at its schema
 * default. */
export const userPreferencesRepository = {
  async getAutomationsPausedUntil(userId: string): Promise<Date | null> {
    const row = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { automationsPausedUntil: true },
    });
    return row?.automationsPausedUntil ?? null;
  },

  async setAutomationsPausedUntil(userId: string, pausedUntil: Date | null): Promise<void> {
    await prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, automationsPausedUntil: pausedUntil },
      update: { automationsPausedUntil: pausedUntil },
    });
  },

  /** The notification-engine's quiet-hours/on-off check
   * (ai/src/notificationExecutor.ts) — a missing row means every field
   * is at its schema default (notificationsEnabled: true, no quiet
   * hours), same "absence, not failure" convention as everywhere else. */
  /** The standing "automations on/off" preference, distinct from the
   * temporary `automationsPausedUntil` override. Read by the Adaptive
   * Environment guards (ai/src/environmentGuards.ts); defaults to true
   * for a user who has never opened preferences, matching the column
   * default. */
  /** Display units. The column already existed and defaulted to
   * imperial, but nothing read it — measurements are stored metric and
   * this decides how they are shown. */
  async getPreferredUnits(userId: string): Promise<'imperial' | 'metric'> {
    const row = await prisma.userPreferences.findUnique({ where: { userId }, select: { preferredUnits: true } });
    return row?.preferredUnits === 'metric' ? 'metric' : 'imperial';
  },

  async setPreferredUnits(userId: string, units: 'imperial' | 'metric'): Promise<void> {
    await prisma.userPreferences.upsert({
      where: { userId },
      update: { preferredUnits: units },
      create: { userId, preferredUnits: units },
    });
  },

  async getAutomationsEnabled(userId: string): Promise<boolean> {
    const row = await prisma.userPreferences.findUnique({ where: { userId }, select: { automationsEnabled: true } });
    return row?.automationsEnabled ?? true;
  },

  async getNotificationPreferences(userId: string): Promise<{
    notificationsEnabled: boolean;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
    notificationDigestMode: 'IMMEDIATE' | 'HOURLY';
  }> {
    const row = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { notificationsEnabled: true, quietHoursStart: true, quietHoursEnd: true, notificationDigestMode: true },
    });
    return {
      notificationsEnabled: row?.notificationsEnabled ?? true,
      quietHoursStart: row?.quietHoursStart ?? null,
      quietHoursEnd: row?.quietHoursEnd ?? null,
      notificationDigestMode: row?.notificationDigestMode ?? 'IMMEDIATE',
    };
  },

  async setNotificationPreferences(
    userId: string,
    input: {
      notificationsEnabled?: boolean | undefined;
      quietHoursStart?: string | null | undefined;
      quietHoursEnd?: string | null | undefined;
      notificationDigestMode?: 'IMMEDIATE' | 'HOURLY' | undefined;
    },
  ): Promise<void> {
    await prisma.userPreferences.upsert({
      where: { userId },
      create: {
        userId,
        notificationsEnabled: input.notificationsEnabled ?? true,
        quietHoursStart: input.quietHoursStart ?? null,
        quietHoursEnd: input.quietHoursEnd ?? null,
        notificationDigestMode: input.notificationDigestMode ?? 'IMMEDIATE',
      },
      update: {
        ...(input.notificationsEnabled !== undefined ? { notificationsEnabled: input.notificationsEnabled } : {}),
        ...(input.quietHoursStart !== undefined ? { quietHoursStart: input.quietHoursStart } : {}),
        ...(input.quietHoursEnd !== undefined ? { quietHoursEnd: input.quietHoursEnd } : {}),
        ...(input.notificationDigestMode !== undefined ? { notificationDigestMode: input.notificationDigestMode } : {}),
      },
    });
  },

  /** Read-only, single-field fetch — used by
   * ai/src/notificationExecutor.ts's `deliverNotification` on the hot
   * path of every dispatch outcome, so it doesn't pull quiet-hours
   * fields it doesn't need there. */
  async getNotificationDigestMode(userId: string): Promise<'IMMEDIATE' | 'HOURLY'> {
    const row = await prisma.userPreferences.findUnique({ where: { userId }, select: { notificationDigestMode: true } });
    return row?.notificationDigestMode ?? 'IMMEDIATE';
  },

  /** Disabled by default (schema default `false`) — a missing row means
   * security-accessory control has never been enabled, same "absence,
   * not failure" convention as every other preference here. Checked on
   * the hot dispatch path (ai/src/actionExecutors.ts's homekit
   * executor) before any `homekit.security_control` action is queued.
   * See docs/HOME_SCENES_ARCHITECTURE.md. */
  async getSecurityControlEnabled(userId: string): Promise<boolean> {
    const row = await prisma.userPreferences.findUnique({ where: { userId }, select: { securityControlEnabled: true } });
    return row?.securityControlEnabled ?? false;
  },

  async setSecurityControlEnabled(userId: string, enabled: boolean): Promise<void> {
    await prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, securityControlEnabled: enabled },
      update: { securityControlEnabled: enabled },
    });
  },

  /** Null fields mean "not set" — every weather-dependent feature reads
   * this and simply doesn't fire rather than guessing a location. See
   * docs/WEATHER_INTEGRATION.md. */
  async getWeatherLocation(userId: string): Promise<{ name: string; lat: number; lng: number } | null> {
    const row = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { weatherLocationName: true, weatherLat: true, weatherLng: true },
    });
    if (!row?.weatherLocationName || row.weatherLat === null || row.weatherLng === null) return null;
    return { name: row.weatherLocationName, lat: row.weatherLat, lng: row.weatherLng };
  },

  async setWeatherLocation(userId: string, location: { name: string; lat: number; lng: number }): Promise<void> {
    await prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, weatherLocationName: location.name, weatherLat: location.lat, weatherLng: location.lng },
      update: { weatherLocationName: location.name, weatherLat: location.lat, weatherLng: location.lng },
    });
  },

  async getSleepTempRangeC(userId: string): Promise<{ min: number; max: number } | null> {
    const row = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { sleepTempMinC: true, sleepTempMaxC: true },
    });
    if (row?.sleepTempMinC === null || row?.sleepTempMinC === undefined || row?.sleepTempMaxC === null || row?.sleepTempMaxC === undefined) {
      return null;
    }
    return { min: row.sleepTempMinC, max: row.sleepTempMaxC };
  },

  async setSleepTempRangeC(userId: string, range: { min: number; max: number }): Promise<void> {
    await prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, sleepTempMinC: range.min, sleepTempMaxC: range.max },
      update: { sleepTempMinC: range.min, sleepTempMaxC: range.max },
    });
  },
};
