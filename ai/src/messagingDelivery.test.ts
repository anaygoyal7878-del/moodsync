import { describe, expect, it, vi, beforeEach } from 'vitest';

const { listForUserMock, logMessageMock, touchMock, countProactiveMock, getSettingsMock, getTimezoneMock } = vi.hoisted(
  () => ({
    listForUserMock: vi.fn(),
    logMessageMock: vi.fn(),
    touchMock: vi.fn(),
    countProactiveMock: vi.fn(async () => 0),
    // Explicitly typed: without the annotation the literal `null`
    // defaults narrow quietHours* to type `null`, and a test that sets
    // a real hour stops compiling.
    getSettingsMock: vi.fn(
      async (): Promise<{
        proactiveEnabled: boolean;
        quietHoursStart: number | null;
        quietHoursEnd: number | null;
        dailyProactiveLimit: number;
      }> => ({
        proactiveEnabled: true,
        quietHoursStart: null,
        quietHoursEnd: null,
        dailyProactiveLimit: 3,
      }),
    ),
    getTimezoneMock: vi.fn(async () => 'UTC'),
  }),
);

vi.mock('@moodsync/database', () => ({
  messagingRepository: {
    listForUser: listForUserMock,
    logMessage: logMessageMock,
    touch: touchMock,
    countProactiveSince: countProactiveMock,
  },
  messagingSettingsRepository: { get: getSettingsMock },
  userTimezoneRepository: { getTimezone: getTimezoneMock },
}));

const { sendProactiveInsight, canSendProactive, withinQuietHours } = await import('./messagingDelivery.js');

const verifiedConn = { id: 'c1', userId: 'u1', channel: 'IMESSAGE', handle: '+15551234567', verifiedAt: new Date(), optedOutAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.MESSAGING_SEND_URL;
  delete process.env.MESSAGING_API_KEY;
  vi.unstubAllGlobals();
});

describe('sendProactiveInsight', () => {
  it('sends nothing when there is no verified, opted-in connection', async () => {
    listForUserMock.mockResolvedValueOnce([]);
    const result = await sendProactiveInsight('u1', 'Recovery is unusually high', 'Consider a harder session today.');
    expect(result.sent).toBe(0);
    expect(logMessageMock).not.toHaveBeenCalled();
  });

  it('skips an unverified connection and one that opted out', async () => {
    listForUserMock.mockResolvedValueOnce([
      { ...verifiedConn, id: 'c2', verifiedAt: null },
      { ...verifiedConn, id: 'c3', optedOutAt: new Date() },
    ]);
    const result = await sendProactiveInsight('u1', 'Title', 'Body');
    expect(result.sent).toBe(0);
  });

  it('skips a WhatsApp connection (BlueBubbles only handles iMessage/SMS)', async () => {
    listForUserMock.mockResolvedValueOnce([{ ...verifiedConn, channel: 'WHATSAPP' }]);
    const result = await sendProactiveInsight('u1', 'Title', 'Body');
    expect(result.sent).toBe(0);
  });

  it('logs the message even when no provider is configured, with a null externalId', async () => {
    listForUserMock.mockResolvedValueOnce([verifiedConn]);
    const result = await sendProactiveInsight('u1', 'Recovery is unusually high', 'Consider a harder session today.');
    expect(result.sent).toBe(1);
    expect(logMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: 'c1', direction: 'OUTBOUND', externalId: null }),
    );
    expect(touchMock).toHaveBeenCalledWith('c1', 'OUTBOUND');
  });

  it('includes the opt-out line and both title and body in the text sent', async () => {
    listForUserMock.mockResolvedValueOnce([verifiedConn]);
    await sendProactiveInsight('u1', 'Recovery is unusually high', 'Consider a harder session today.');
    const loggedBody = logMessageMock.mock.calls[0]![0].body as string;
    expect(loggedBody).toContain('Recovery is unusually high');
    expect(loggedBody).toContain('Consider a harder session today.');
    expect(loggedBody).toContain('STOP');
  });

  it('records the real externalId when a provider is configured and the send succeeds', async () => {
    process.env.MESSAGING_SEND_URL = 'https://bluebubbles.example.com';
    process.env.MESSAGING_API_KEY = 'server-password';
    listForUserMock.mockResolvedValueOnce([verifiedConn]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { guid: 'bb-guid-1' } }) }),
    );

    await sendProactiveInsight('u1', 'Title', 'Body');

    expect(logMessageMock).toHaveBeenCalledWith(expect.objectContaining({ externalId: 'bb-guid-1' }));
  });

  it('still logs with a null externalId when the provider call throws', async () => {
    process.env.MESSAGING_SEND_URL = 'https://bluebubbles.example.com';
    process.env.MESSAGING_API_KEY = 'server-password';
    listForUserMock.mockResolvedValueOnce([verifiedConn]);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const result = await sendProactiveInsight('u1', 'Title', 'Body');

    expect(result.sent).toBe(1);
    expect(logMessageMock).toHaveBeenCalledWith(expect.objectContaining({ externalId: null }));
  });
});

describe('withinQuietHours', () => {
  it('is never quiet when no window is set', () => {
    expect(withinQuietHours(3, null, null)).toBe(false);
    expect(withinQuietHours(3, 22, null)).toBe(false);
  });

  it('handles a window that crosses midnight — the common case', () => {
    expect(withinQuietHours(23, 22, 7)).toBe(true);
    expect(withinQuietHours(3, 22, 7)).toBe(true);
    expect(withinQuietHours(12, 22, 7)).toBe(false);
  });

  it('is half-open, so "quiet until 7" lets the 7am message through', () => {
    expect(withinQuietHours(6, 22, 7)).toBe(true);
    expect(withinQuietHours(7, 22, 7)).toBe(false);
    // And the start hour is inclusive.
    expect(withinQuietHours(22, 22, 7)).toBe(true);
  });

  it('handles a same-day window too', () => {
    expect(withinQuietHours(10, 9, 17)).toBe(true);
    expect(withinQuietHours(20, 9, 17)).toBe(false);
  });

  it('treats a zero-width window as no quiet hours, never as always-quiet', () => {
    // Reading start === end as "quiet all day" would silently mute
    // every proactive message from a setting that looks like a no-op.
    expect(withinQuietHours(3, 9, 9)).toBe(false);
    expect(withinQuietHours(9, 9, 9)).toBe(false);
  });
});

describe('canSendProactive', () => {
  const base = { proactiveEnabled: true, quietHoursStart: null, quietHoursEnd: null, dailyProactiveLimit: 3 };

  it('allows a normal send', () => {
    expect(canSendProactive(base, 14, 0, 1)).toEqual({ allowed: true, reason: null });
  });

  it('refuses when the user turned proactive messages off', () => {
    expect(canSendProactive({ ...base, proactiveEnabled: false }, 14, 0, 1).reason).toBe('disabled');
  });

  it('refuses with nothing connected', () => {
    expect(canSendProactive(base, 14, 0, 0).reason).toBe('no_connections');
  });

  it('refuses inside quiet hours', () => {
    const settings = { ...base, quietHoursStart: 22, quietHoursEnd: 7 };
    expect(canSendProactive(settings, 2, 0, 1).reason).toBe('quiet_hours');
    expect(canSendProactive(settings, 14, 0, 1).allowed).toBe(true);
  });

  it('refuses once the daily cap is reached, not after exceeding it', () => {
    expect(canSendProactive(base, 14, 2, 1).allowed).toBe(true);
    expect(canSendProactive(base, 14, 3, 1).reason).toBe('daily_limit_reached');
  });

  it('treats a zero limit as never texting first', () => {
    expect(canSendProactive({ ...base, dailyProactiveLimit: 0 }, 14, 0, 1).reason).toBe('daily_limit_reached');
  });

  it('reports the user-set reason ahead of incidental ones', () => {
    // Someone who switched proactive off should see that, not
    // "quiet hours" — the explicit choice is the real answer.
    const settings = { ...base, proactiveEnabled: false, quietHoursStart: 22, quietHoursEnd: 7 };
    expect(canSendProactive(settings, 2, 99, 0).reason).toBe('disabled');
  });
});

describe('sendProactiveInsight — settings enforcement', () => {
  it('tags the outbound row `proactive`, which is what makes the daily cap countable', async () => {
    listForUserMock.mockResolvedValueOnce([verifiedConn]);

    await sendProactiveInsight('u1', 'Heads up', 'Your recovery is low.');

    expect(logMessageMock).toHaveBeenCalledWith(expect.objectContaining({ direction: 'OUTBOUND', intent: 'proactive' }));
  });

  it('sends nothing at all once today’s cap is reached', async () => {
    listForUserMock.mockResolvedValueOnce([verifiedConn]);
    countProactiveMock.mockResolvedValueOnce(3);

    const result = await sendProactiveInsight('u1', 'Heads up', 'Your recovery is low.');

    expect(result).toEqual({ sent: 0, blocked: 'daily_limit_reached' });
    expect(logMessageMock).not.toHaveBeenCalled();
  });

  it('stays silent during quiet hours', async () => {
    listForUserMock.mockResolvedValueOnce([verifiedConn]);
    getSettingsMock.mockResolvedValueOnce({
      proactiveEnabled: true,
      quietHoursStart: 22,
      quietHoursEnd: 7,
      dailyProactiveLimit: 3,
    });

    // 03:00 UTC, with the user's timezone mocked to UTC.
    const result = await sendProactiveInsight('u1', 'Heads up', 'x', new Date(Date.UTC(2026, 7, 20, 3, 0, 0)));

    expect(result.blocked).toBe('quiet_hours');
    expect(logMessageMock).not.toHaveBeenCalled();
  });

  it('respects the user switching proactive messages off entirely', async () => {
    listForUserMock.mockResolvedValueOnce([verifiedConn]);
    getSettingsMock.mockResolvedValueOnce({
      proactiveEnabled: false,
      quietHoursStart: null,
      quietHoursEnd: null,
      dailyProactiveLimit: 3,
    });

    expect((await sendProactiveInsight('u1', 'Heads up', 'x')).blocked).toBe('disabled');
    expect(logMessageMock).not.toHaveBeenCalled();
  });
});
