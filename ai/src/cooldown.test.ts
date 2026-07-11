import { describe, expect, it } from 'vitest';
import { isWithinCooldown } from './cooldown.js';

describe('isWithinCooldown', () => {
  const now = new Date('2026-07-10T12:00:00Z');

  it('is not in cooldown if the rule has never executed', () => {
    expect(isWithinCooldown(null, 30, now)).toBe(false);
  });

  it('is in cooldown when the last execution was within the window', () => {
    const lastExecutedAt = new Date('2026-07-10T11:50:00Z'); // 10 min ago
    expect(isWithinCooldown(lastExecutedAt, 30, now)).toBe(true);
  });

  it('is not in cooldown once the window has elapsed', () => {
    const lastExecutedAt = new Date('2026-07-10T11:00:00Z'); // 60 min ago
    expect(isWithinCooldown(lastExecutedAt, 30, now)).toBe(false);
  });

  it('is never in cooldown when cooldownMinutes is 0', () => {
    const lastExecutedAt = new Date('2026-07-10T11:59:59Z');
    expect(isWithinCooldown(lastExecutedAt, 0, now)).toBe(false);
  });

  it('treats exactly-at-the-boundary as no longer in cooldown', () => {
    const lastExecutedAt = new Date('2026-07-10T11:30:00Z'); // exactly 30 min ago
    expect(isWithinCooldown(lastExecutedAt, 30, now)).toBe(false);
  });
});
