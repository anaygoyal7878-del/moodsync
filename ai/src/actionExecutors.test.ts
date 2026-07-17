import { describe, expect, it } from 'vitest';
import { executeAction } from './actionExecutors.js';

describe('executeAction', () => {
  it('throws for a provider with no registered executor rather than silently no-opping', async () => {
    await expect(executeAction('u1', { type: 'notification.reduce_intensity', provider: 'notification', params: {} }, 'r1')).rejects.toThrow(
      'Provider "notification" automation dispatch is not yet implemented',
    );
  });
});
