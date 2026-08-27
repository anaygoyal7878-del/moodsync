import { describe, expect, it, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const { sendAgenticMessageMock, executeConfirmedActionMock, verifyAccessTokenMock } = vi.hoisted(() => ({
  sendAgenticMessageMock: vi.fn(),
  executeConfirmedActionMock: vi.fn(),
  verifyAccessTokenMock: vi.fn(async (_token: string) => ({ sub: 'user-1' })),
}));

vi.mock('@moodsync/ai', async () => {
  const actual = await vi.importActual<typeof import('@moodsync/ai')>('@moodsync/ai');
  return {
    ...actual,
    sendAgenticMessage: (...args: unknown[]) => sendAgenticMessageMock(...args),
    executeConfirmedAction: (...args: unknown[]) => executeConfirmedActionMock(...args),
  };
});

// The real authenticate plugin is registered (not stubbed) so these
// tests exercise the actual preHandler wiring; only the JWT
// verification underneath it is faked, matching the real 401-on-bad-
// token / userId-on-good-token contract without needing a real secret.
vi.mock('../../auth/jwt.js', () => ({
  verifyAccessToken: verifyAccessTokenMock,
}));

const authenticatePlugin = (await import('../plugins/authenticate.js')).default;
const claraRoutes = (await import('./clara.js')).default;

function buildApp() {
  const app = Fastify();
  app.register(authenticatePlugin);
  app.register(claraRoutes, { prefix: '/api' });
  return app;
}

const AUTH_HEADERS = { authorization: 'Bearer token' };

beforeEach(() => {
  vi.clearAllMocks();
  verifyAccessTokenMock.mockResolvedValue({ sub: 'user-1' });
});

describe('POST /clara/chat', () => {
  it('calls the same agentic engine the messaging bot uses, not the old read-only path', async () => {
    sendAgenticMessageMock.mockResolvedValue({ text: 'Your recovery is 72 today.', pendingAction: null });
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/clara/chat',
      payload: { messages: [{ role: 'user', content: 'how am I doing' }] },
      headers: AUTH_HEADERS,
    });

    expect(response.statusCode).toBe(200);
    expect(sendAgenticMessageMock).toHaveBeenCalledWith('user-1', [{ role: 'user', content: 'how am I doing' }]);
    expect(response.json()).toEqual({ reply: 'Your recovery is 72 today.', pendingAction: null });
  });

  it('surfaces a proposed action as structured data, not just text', async () => {
    sendAgenticMessageMock.mockResolvedValue({
      text: 'ignored — the confirmPrompt is the real reply',
      pendingAction: {
        toolName: 'control_hue_light',
        args: { lightName: 'Bedroom', on: false },
        confirmPrompt: 'Turn off "Bedroom"? Reply YES to confirm.',
      },
    });
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/clara/chat',
      payload: { messages: [{ role: 'user', content: 'turn off the bedroom light' }] },
      headers: AUTH_HEADERS,
    });

    expect(response.json()).toEqual({
      reply: 'Turn off "Bedroom"? Reply YES to confirm.',
      pendingAction: { toolName: 'control_hue_light', args: { lightName: 'Bedroom', on: false } },
    });
  });

  it('reports 503 when Clara is not configured', async () => {
    const { ClaraNotConfiguredError } = await vi.importActual<typeof import('@moodsync/ai')>('@moodsync/ai');
    sendAgenticMessageMock.mockRejectedValue(new ClaraNotConfiguredError());
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/clara/chat',
      payload: { messages: [{ role: 'user', content: 'hi' }] },
      headers: AUTH_HEADERS,
    });

    expect(response.statusCode).toBe(503);
  });

  it('rejects an empty message list', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'POST', url: '/api/clara/chat', payload: { messages: [] }, headers: AUTH_HEADERS });
    expect(response.statusCode).toBe(400);
    expect(sendAgenticMessageMock).not.toHaveBeenCalled();
  });
});

describe('POST /clara/actions/confirm', () => {
  it('re-validates and executes the confirmed action', async () => {
    executeConfirmedActionMock.mockResolvedValue('Done — "Bedroom" updated.');
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/clara/actions/confirm',
      payload: { toolName: 'control_hue_light', args: { lightName: 'Bedroom', on: false } },
      headers: AUTH_HEADERS,
    });

    expect(response.statusCode).toBe(200);
    expect(executeConfirmedActionMock).toHaveBeenCalledWith('user-1', 'control_hue_light', { lightName: 'Bedroom', on: false });
    expect(response.json()).toEqual({ reply: 'Done — "Bedroom" updated.' });
  });

  it('surfaces a re-validation failure (e.g. the light was renamed) as a clear error, not a 500', async () => {
    executeConfirmedActionMock.mockRejectedValue(new Error('No light named "Bedroom". Available: Kitchen'));
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/clara/actions/confirm',
      payload: { toolName: 'control_hue_light', args: { lightName: 'Bedroom' } },
      headers: AUTH_HEADERS,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error).toContain('No light named');
  });

  it('rejects a request with no toolName', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'POST', url: '/api/clara/actions/confirm', payload: { args: {} }, headers: AUTH_HEADERS });
    expect(response.statusCode).toBe(400);
    expect(executeConfirmedActionMock).not.toHaveBeenCalled();
  });
});
