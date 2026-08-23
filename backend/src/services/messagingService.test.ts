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
const findActivePending = vi.fn().mockResolvedValue(null);
const clearPending = vi.fn();
const setPending = vi.fn();

vi.mock('@moodsync/database', () => ({
  messagingRepository: {
    findByHandle: (...args: unknown[]) => findByHandle(...args),
    logMessage: (...args: unknown[]) => logMessage(...args),
    touch: (...args: unknown[]) => touch(...args),
    setOptedOut: vi.fn(),
    confirmVerification: vi.fn(),
    countInboundSince: vi.fn().mockResolvedValue(0),
    recentHistory: vi.fn().mockResolvedValue([]),
    listInboundForProfile: vi.fn().mockResolvedValue([]),
    startVerification: vi.fn(),
  },
  userTimezoneRepository: { getTimezone: vi.fn().mockResolvedValue('UTC') },
  messagingPendingActionRepository: {
    findActive: (...args: unknown[]) => findActivePending(...args),
    clear: (...args: unknown[]) => clearPending(...args),
    set: (...args: unknown[]) => setPending(...args),
  },
  caffeineLogRepository: {
    create: vi.fn(),
    listRecentForUser: vi.fn().mockResolvedValue([]),
  },
}));

const sendAgenticMessage = vi.fn();
const executeConfirmedAction = vi.fn();
const transcribeVoiceMessage = vi.fn();

vi.mock('@moodsync/ai', async () => {
  const actual = await vi.importActual<typeof import('@moodsync/ai')>('@moodsync/ai');
  return {
    ...actual,
    sendAgenticMessage: (...args: unknown[]) => sendAgenticMessage(...args),
    executeConfirmedAction: (...args: unknown[]) => executeConfirmedAction(...args),
    transcribeVoiceMessage: (...args: unknown[]) => transcribeVoiceMessage(...args),
  };
});

const sendBlueBubblesMessage = vi.fn();
const downloadBlueBubblesAttachment = vi.fn();

vi.mock('./messagingProviders/blueBubbles.js', async () => {
  const actual = await vi.importActual<typeof import('./messagingProviders/blueBubbles.js')>(
    './messagingProviders/blueBubbles.js',
  );
  return {
    ...actual,
    sendBlueBubblesMessage: (...args: unknown[]) => sendBlueBubblesMessage(...args),
    downloadBlueBubblesAttachment: (...args: unknown[]) => downloadBlueBubblesAttachment(...args),
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

describe('messagingService.handleInbound — agentic action confirmation', () => {
  const pendingRow = {
    connectionId: 'conn-1',
    toolName: 'control_hue_light',
    argsJson: JSON.stringify({ lightName: 'Bedroom', on: false }),
    promptText: 'Turn off "Bedroom"? Reply YES to confirm.',
  };

  it('proposes a pending action from the agentic reply instead of executing immediately', async () => {
    findByHandle.mockResolvedValue(baseConnection);
    findActivePending.mockResolvedValue(null);
    sendAgenticMessage.mockResolvedValue({
      text: 'Turn off "Bedroom"? Reply YES to confirm.',
      pendingAction: { toolName: 'control_hue_light', args: { lightName: 'Bedroom', on: false }, confirmPrompt: 'Turn off "Bedroom"? Reply YES to confirm.' },
    });
    const { messagingService } = await import('./messagingService.js');

    const result = await messagingService.handleInbound({ channel: 'IMESSAGE', from: '+15551234567', body: 'turn off the bedroom light' });

    expect(result.intent).toBe('action_proposed');
    expect(setPending).toHaveBeenCalledWith(expect.objectContaining({ toolName: 'control_hue_light' }));
    expect(executeConfirmedAction).not.toHaveBeenCalled();
  });

  it('executes the pending action on an affirmative reply and clears it', async () => {
    findByHandle.mockResolvedValue(baseConnection);
    findActivePending.mockResolvedValue(pendingRow);
    executeConfirmedAction.mockResolvedValue('Done — "Bedroom" updated.');
    const { messagingService } = await import('./messagingService.js');

    const result = await messagingService.handleInbound({ channel: 'IMESSAGE', from: '+15551234567', body: 'yes' });

    expect(executeConfirmedAction).toHaveBeenCalledWith('user-1', 'control_hue_light', { lightName: 'Bedroom', on: false });
    expect(clearPending).toHaveBeenCalledWith('conn-1');
    expect(result.text).toBe('Done — "Bedroom" updated.');
    expect(sendAgenticMessage).not.toHaveBeenCalled();
  });

  it('cancels the pending action on a negative reply without executing it', async () => {
    findByHandle.mockResolvedValue(baseConnection);
    findActivePending.mockResolvedValue(pendingRow);
    const { messagingService } = await import('./messagingService.js');

    const result = await messagingService.handleInbound({ channel: 'IMESSAGE', from: '+15551234567', body: 'no thanks' });

    expect(executeConfirmedAction).not.toHaveBeenCalled();
    expect(clearPending).toHaveBeenCalledWith('conn-1');
    expect(result.intent).toBe('action_cancelled');
  });

  it('falls through to normal handling when the reply is neither yes nor no, leaving the pending action untouched', async () => {
    findByHandle.mockResolvedValue(baseConnection);
    findActivePending.mockResolvedValue(pendingRow);
    sendAgenticMessage.mockResolvedValue({ text: 'Sure, what else?', pendingAction: null });
    const { messagingService } = await import('./messagingService.js');

    await messagingService.handleInbound({ channel: 'IMESSAGE', from: '+15551234567', body: 'actually what time is it' });

    expect(executeConfirmedAction).not.toHaveBeenCalled();
    expect(clearPending).not.toHaveBeenCalled();
  });
});

describe('messagingService.handleInbound — conversation profile wiring', () => {
  it('passes the wide inbound sample and the user timezone to the agent, not just the replay window', async () => {
    findByHandle.mockResolvedValue(baseConnection);
    findActivePending.mockResolvedValue(null);
    sendAgenticMessage.mockResolvedValue({ text: 'Sure.', pendingAction: null });

    const { messagingService } = await import('./messagingService.js');
    await messagingService.handleInbound({ channel: 'IMESSAGE', from: '+15551234567', body: 'how did I sleep?' });

    // The third argument is what makes the agent per-conversation —
    // without it sendAgenticMessage falls back to a generic profile.
    const context = sendAgenticMessage.mock.calls[0]![2];
    expect(context).toMatchObject({ timeZone: 'UTC' });
    expect(Array.isArray(context.inboundHistory)).toBe(true);
  });
});

describe('messagingService.handleInbound — voice messages', () => {
  const audioAttachment = { guid: 'att-1', mimeType: 'audio/mp3' };

  it('transcribes a voice message and routes the transcript through the normal agentic path', async () => {
    findByHandle.mockResolvedValue(baseConnection);
    findActivePending.mockResolvedValue(null);
    downloadBlueBubblesAttachment.mockResolvedValue({ data: Buffer.from('audio-bytes'), mimeType: 'audio/mp3' });
    transcribeVoiceMessage.mockResolvedValue('how did I sleep last night');
    sendAgenticMessage.mockResolvedValue({ text: 'You slept 7 hours.', pendingAction: null });

    const { messagingService } = await import('./messagingService.js');
    const result = await messagingService.handleInbound({ channel: 'IMESSAGE', from: '+15551234567', audioAttachment });

    expect(downloadBlueBubblesAttachment).toHaveBeenCalledWith('att-1');
    expect(transcribeVoiceMessage).toHaveBeenCalledWith({ data: Buffer.from('audio-bytes'), mimeType: 'audio/mp3' });
    // The real transcript is what gets logged as the inbound message and
    // sent into the agent — nothing downstream should ever see raw audio.
    const inboundLog = logMessage.mock.calls.find((call) => call[0].direction === 'INBOUND');
    expect(inboundLog![0].body).toBe('how did I sleep last night');
    expect(result.text).toBe('You slept 7 hours.');
  });

  it('never transcribes a voice message from an unrecognized number', async () => {
    findByHandle.mockResolvedValue(null);

    const { messagingService } = await import('./messagingService.js');
    const result = await messagingService.handleInbound({ channel: 'IMESSAGE', from: '+19995551234', audioAttachment });

    expect(downloadBlueBubblesAttachment).not.toHaveBeenCalled();
    expect(transcribeVoiceMessage).not.toHaveBeenCalled();
    expect(result.intent).toBe('unknown_handle');
  });

  it('replies plainly and logs a placeholder when transcription fails, without fabricating a transcript', async () => {
    findByHandle.mockResolvedValue(baseConnection);
    findActivePending.mockResolvedValue(null);
    downloadBlueBubblesAttachment.mockResolvedValue({ data: Buffer.from('x'), mimeType: 'audio/caf' });
    transcribeVoiceMessage.mockRejectedValue(new Error('Unsupported audio format: audio/caf'));

    const { messagingService } = await import('./messagingService.js');
    const result = await messagingService.handleInbound({ channel: 'IMESSAGE', from: '+15551234567', audioAttachment });

    expect(result.intent).toBe('voice_transcription_failed');
    expect(result.text).toBeTruthy();
    expect(sendAgenticMessage).not.toHaveBeenCalled();
    const inboundLog = logMessage.mock.calls.find((call) => call[0].direction === 'INBOUND');
    expect(inboundLog![0].body).toBe('[voice message — could not transcribe]');
    expect(inboundLog![0].intent).toBe('voice_transcription_failed');
  });

  it('still delivers the failure reply through the configured provider', async () => {
    process.env.MESSAGING_SEND_URL = 'https://bluebubbles.example.com';
    process.env.MESSAGING_API_KEY = 'server-password';
    findByHandle.mockResolvedValue(baseConnection);
    findActivePending.mockResolvedValue(null);
    downloadBlueBubblesAttachment.mockResolvedValue({ data: Buffer.from('x'), mimeType: 'audio/caf' });
    transcribeVoiceMessage.mockRejectedValue(new Error('nope'));
    sendBlueBubblesMessage.mockResolvedValue({ externalId: 'bb-1' });

    const { messagingService } = await import('./messagingService.js');
    await messagingService.handleInbound({ channel: 'IMESSAGE', from: '+15551234567', audioAttachment });

    expect(sendBlueBubblesMessage).toHaveBeenCalled();
  });
});
