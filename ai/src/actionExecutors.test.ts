import { describe, expect, it, vi } from 'vitest';

const { createMock, getSecurityControlEnabledMock } = vi.hoisted(() => ({
  createMock: vi.fn(async () => ({ id: 'cmd-1' })),
  getSecurityControlEnabledMock: vi.fn(async () => false),
}));

vi.mock('@moodsync/database', () => ({
  pendingDeviceCommandRepository: { create: createMock },
  userPreferencesRepository: { getSecurityControlEnabled: getSecurityControlEnabledMock },
}));

const { executeAction } = await import('./actionExecutors.js');

describe('executeAction', () => {
  it('throws for a provider with no registered executor rather than silently no-opping', async () => {
    await expect(executeAction('u1', { type: 'notification.reduce_intensity', provider: 'notification', params: {} }, 'r1')).rejects.toThrow(
      'Provider "notification" automation dispatch is not yet implemented',
    );
  });

  it('refuses to queue homekit.security_control while UserPreferences.securityControlEnabled is false', async () => {
    getSecurityControlEnabledMock.mockResolvedValueOnce(false);
    const result = await executeAction('u1', { type: 'homekit.security_control', provider: 'homekit', params: { accessoryId: 'a1', command: 'unlock' } }, 'r1');
    expect(result).toEqual({ queued: false, skippedSecurityControlDisabled: true });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('queues homekit.security_control once UserPreferences.securityControlEnabled is true', async () => {
    getSecurityControlEnabledMock.mockResolvedValueOnce(true);
    const result = await executeAction('u1', { type: 'homekit.security_control', provider: 'homekit', params: { accessoryId: 'a1', command: 'unlock' } }, 'r1');
    expect(result).toEqual({ queued: true });
    expect(createMock).toHaveBeenCalledWith({ userId: 'u1', provider: 'HOMEKIT', action: expect.objectContaining({ type: 'homekit.security_control' }), ruleId: 'r1' });
  });

  it('queues homekit.run_scene without checking the security-control toggle', async () => {
    getSecurityControlEnabledMock.mockClear();
    const result = await executeAction('u1', { type: 'homekit.run_scene', provider: 'homekit', params: { sceneId: 's1', sceneName: 'Wind Down' } }, 'r1');
    expect(result).toEqual({ queued: true });
    expect(getSecurityControlEnabledMock).not.toHaveBeenCalled();
  });
});
