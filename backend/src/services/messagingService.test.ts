import { describe, expect, it, beforeAll, vi, beforeEach } from 'vitest';

beforeAll(() => {
  process.env.OAUTH_TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
  process.env.OAUTH_STATE_SECRET ??= 'c'.repeat(32);
  process.env.JWT_ACCESS_SECRET ??= 'a'.repeat(32);
  process.env.JWT_REFRESH_SECRET ??= 'b'.repeat(32);
  process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/db';
});

const logMessage = vi.fn();
const touch = vi.fn();
const findByHandle = vi.fn();

vi.mock('@moodsync/database', () => ({
  messagingRepository: {
    findByHandle: (...args: unknown[]) => findByHandle(...args),
    logMessage: (...args: unknown[]) => logMessage(...args),
    touch: (...args: unknown[]) => touch(...args),
    setOptedOut: vi.fn(),
    confirmVerification: vi.fn(),
    countInboundSince: vi.fn().mockResolvedValue(0),
    recentHistory: vi.fn().mockResolvedValue([]),
    startVerification: vi.fn(),
  },
  caffeineLogRepository: {
    create: vi.fn(),
    listRecentForUser: vi.fn().mockResolvedValue([]),
  },
}));

const sendBlueBubblesMessage = vi.fn();

vi.mock('./messagingProviders/blueBubbles.js', async () => {
  const actual = await vi.importActual<typeof import('./messagingProviders/blueBubbles.js')>(
    './messagingProviders/blueBubbles.js',
  );
  return {
    ...actual,
    sendBlueBubblesMessage: (...args: unknown[]) => sendBlueBubblesMessage(...args),
  };
});

const baseConnection = {
  id: 'conn-1',
  userId: 'user-1',
  channel: 'IMESSAGE' as const,
  handle: '+15551234567',
  verifiedAt: new Date(),
  optedOutAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  delete process.env.MESSAGING_SEND_URL;
  delete process.env.MESSAGING_API_KEY;
});

describe('messagingService.handleInbound — outbound delivery', () => {
  it('logs the outbound reply without sending when no provider is configured', async () => {
    findByHandle.mockResolvedValue(baseConnection);
    const { messagingService } = await import('./messagingService.js');

    await messagingService.handleInbound({ channel: 'IMESSAGE', from: '+15551234567', body: 'HELP' });

    expect(sendBlueBubblesMessage).not.toHaveBeenCalled();
    const outboundCall = logMessage.mock.calls.find((call) => call[0].direction === 'OUTBOUND');
    expect(outboundCall).toBeTruthy();
    expect(outboundCall![0].externalId).toBeNull();
  });

  it('sends through BlueBubbles and records the externalId when configured', async () => {
    process.env.MESSAGING_SEND_URL = 'https://bluebubbles.example.com';
    process.env.MESSAGING_API_KEY = 'server-password';
    sendBlueBubblesMessage.mockResolvedValue({ externalId: 'bb-guid-123' });
    findByHandle.mockResolvedValue(baseConnection);
    const { messagingService } = await import('./messagingService.js');

    await messagingService.handleInbound({ channel: 'IMESSAGE', from: '+15551234567', body: 'HELP' });

    expect(sendBlueBubblesMessage).toHaveBeenCalledWith('+15551234567', expect.any(String));
    const outboundCall = logMessage.mock.calls.find((call) => call[0].direction === 'OUTBOUND');
    expect(outboundCall![0].externalId).toBe('bb-guid-123');
  });

  it('still logs the reply with a null externalId when the provider send fails', async () => {
    process.env.MESSAGING_SEND_URL = 'https://bluebubbles.example.com';
    process.env.MESSAGING_API_KEY = 'server-password';
    sendBlueBubblesMessage.mockRejectedValue(new Error('connection refused'));
    findByHandle.mockResolvedValue(baseConnection);
    const { messagingService } = await import('./messagingService.js');

    const result = await messagingService.handleInbound({ channel: 'IMESSAGE', from: '+15551234567', body: 'HELP' });

    expect(result.text).toBeTruthy();
    const outboundCall = logMessage.mock.calls.find((call) => call[0].direction === 'OUTBOUND');
    expect(outboundCall![0].externalId).toBeNull();
  });

  it('never sends for a WhatsApp connection even when a provider is configured', async () => {
    process.env.MESSAGING_SEND_URL = 'https://bluebubbles.example.com';
    process.env.MESSAGING_API_KEY = 'server-password';
    findByHandle.mockResolvedValue({ ...baseConnection, channel: 'WHATSAPP' });
    const { messagingService } = await import('./messagingService.js');

    await messagingService.handleInbound({ channel: 'WHATSAPP', from: '+15551234567', body: 'HELP' });

    expect(sendBlueBubblesMessage).not.toHaveBeenCalled();
  });

  it('does not attempt a send for a silent reply (unknown handle, non-crisis)', async () => {
    findByHandle.mockResolvedValue(null);
    const { messagingService } = await import('./messagingService.js');

    const result = await messagingService.handleInbound({ channel: 'IMESSAGE', from: '+19995551234', body: 'hi' });

    expect(result.intent).toBe('unknown_handle');
    expect(sendBlueBubblesMessage).not.toHaveBeenCalled();
    expect(logMessage).not.toHaveBeenCalled();
  });
});
