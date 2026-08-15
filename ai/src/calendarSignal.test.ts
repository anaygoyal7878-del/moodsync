import { describe, expect, it, vi } from 'vitest';

const { findByUserMock, markSyncedMock, getDecryptedMock, listEventsMock, refreshTokenMock, updateTokenMock } = vi.hoisted(() => ({
  findByUserMock: vi.fn(),
  markSyncedMock: vi.fn(),
  getDecryptedMock: vi.fn(),
  listEventsMock: vi.fn(),
  refreshTokenMock: vi.fn(),
  updateTokenMock: vi.fn(),
}));

vi.mock('@moodsync/database', () => ({
  calendarConnectionRepository: {
    findByUser: findByUserMock,
    markSynced: markSyncedMock,
  },
  oauthTokenRepository: {
    getDecrypted: getDecryptedMock,
    update: updateTokenMock,
  },
}));

vi.mock('@moodsync/integration-google-calendar', () => ({
  GoogleCalendarClient: class {
    listEvents = listEventsMock;
  },
  refreshGoogleCalendarToken: refreshTokenMock,
}));

const { getTodayCalendarLoad, isInMeetingNow } = await import('./calendarSignal.js');

const REQUIRED_ENV = {
  GOOGLE_CALENDAR_CLIENT_ID: 'client-id',
  GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret',
  GOOGLE_CALENDAR_REDIRECT_URI: 'https://example.com/callback',
};

describe('getTodayCalendarLoad', () => {
  it('returns null when there is no calendar connection at all', async () => {
    findByUserMock.mockResolvedValue(null);
    const result = await getTodayCalendarLoad('u1', new Date(), new Date());
    expect(result).toBeNull();
    expect(listEventsMock).not.toHaveBeenCalled();
  });

  it('sums booked hours from timed events and excludes all-day events, but still counts them', async () => {
    Object.assign(process.env, REQUIRED_ENV);
    findByUserMock.mockResolvedValue({ id: 'conn-1', oauthTokenId: 'token-1' });
    getDecryptedMock.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(Date.now() + 60 * 60_000),
    });
    listEventsMock.mockResolvedValue([
      { id: 'e1', title: 'Standup', start: new Date('2026-08-15T09:00:00Z'), end: new Date('2026-08-15T09:30:00Z'), isAllDay: false },
      { id: 'e2', title: 'Focus block', start: new Date('2026-08-15T10:00:00Z'), end: new Date('2026-08-15T12:00:00Z'), isAllDay: false },
      { id: 'e3', title: 'Company holiday', start: new Date('2026-08-15T00:00:00Z'), end: new Date('2026-08-16T00:00:00Z'), isAllDay: true },
    ]);

    const result = await getTodayCalendarLoad('u1', new Date('2026-08-15T00:00:00Z'), new Date('2026-08-15T23:59:59Z'));

    expect(result).toEqual({ eventCount: 3, bookedHours: 2.5 });
    expect(markSyncedMock).toHaveBeenCalledWith('conn-1');
  });

  it('refreshes an expired token before reading events', async () => {
    Object.assign(process.env, REQUIRED_ENV);
    findByUserMock.mockResolvedValue({ id: 'conn-1', oauthTokenId: 'token-1' });
    getDecryptedMock.mockResolvedValue({
      accessToken: 'stale-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(Date.now() - 1000),
    });
    refreshTokenMock.mockResolvedValue({ access_token: 'fresh-token', refresh_token: 'new-refresh', scope: 'calendar', expires_in: 3600 });
    listEventsMock.mockResolvedValue([]);

    const result = await getTodayCalendarLoad('u1', new Date(), new Date());

    expect(refreshTokenMock).toHaveBeenCalled();
    expect(updateTokenMock).toHaveBeenCalledWith('token-1', expect.objectContaining({ accessToken: 'fresh-token' }));
    expect(result).toEqual({ eventCount: 0, bookedHours: 0 });
  });

  it('throws when the required env vars are not configured', async () => {
    delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    findByUserMock.mockResolvedValue({ id: 'conn-1', oauthTokenId: 'token-1' });

    await expect(getTodayCalendarLoad('u1', new Date(), new Date())).rejects.toThrow('GOOGLE_CALENDAR_CLIENT_ID');
  });
});

describe('isInMeetingNow', () => {
  const NOW = new Date('2026-08-15T15:00:00Z');

  it('returns false when no calendar is connected — no calendar means no known meeting', async () => {
    findByUserMock.mockResolvedValue(null);
    expect(await isInMeetingNow('u1', NOW)).toBe(false);
  });

  it('returns true for a timed event in progress right now', async () => {
    Object.assign(process.env, REQUIRED_ENV);
    findByUserMock.mockResolvedValue({ id: 'c1', oauthTokenId: 't1' });
    getDecryptedMock.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    listEventsMock.mockResolvedValue([
      { id: 'e1', title: 'Standup', start: new Date('2026-08-15T14:30:00Z'), end: new Date('2026-08-15T15:30:00Z'), isAllDay: false },
    ]);
    expect(await isInMeetingNow('u1', NOW)).toBe(true);
  });

  it('returns false for an event that already ended', async () => {
    Object.assign(process.env, REQUIRED_ENV);
    findByUserMock.mockResolvedValue({ id: 'c1', oauthTokenId: 't1' });
    getDecryptedMock.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    listEventsMock.mockResolvedValue([
      { id: 'e1', title: 'Standup', start: new Date('2026-08-15T13:00:00Z'), end: new Date('2026-08-15T14:00:00Z'), isAllDay: false },
    ]);
    expect(await isInMeetingNow('u1', NOW)).toBe(false);
  });

  it('ignores all-day events — a company holiday is not a meeting', async () => {
    Object.assign(process.env, REQUIRED_ENV);
    findByUserMock.mockResolvedValue({ id: 'c1', oauthTokenId: 't1' });
    getDecryptedMock.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    listEventsMock.mockResolvedValue([
      { id: 'e1', title: 'Company Holiday', start: new Date('2026-08-15T00:00:00Z'), end: new Date('2026-08-16T00:00:00Z'), isAllDay: true },
    ]);
    expect(await isInMeetingNow('u1', NOW)).toBe(false);
  });
});
