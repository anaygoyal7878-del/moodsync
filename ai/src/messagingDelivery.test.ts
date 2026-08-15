import { describe, expect, it, vi, beforeEach } from 'vitest';

const { listForUserMock, logMessageMock, touchMock } = vi.hoisted(() => ({
  listForUserMock: vi.fn(),
  logMessageMock: vi.fn(),
  touchMock: vi.fn(),
}));

vi.mock('@moodsync/database', () => ({
  messagingRepository: {
    listForUser: listForUserMock,
    logMessage: logMessageMock,
    touch: touchMock,
  },
}));

const { sendProactiveInsight } = await import('./messagingDelivery.js');

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
