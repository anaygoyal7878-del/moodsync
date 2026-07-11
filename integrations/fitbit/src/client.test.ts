import { describe, expect, it } from 'vitest';
import { pickPrimaryDevice, type PairedDevice } from './client.js';

function makeDevice(overrides: Partial<PairedDevice> = {}): PairedDevice {
  return { name: 'users/me/pairedDevices/1', deviceType: 'TRACKER', ...overrides };
}

describe('pickPrimaryDevice', () => {
  it('prefers a TRACKER over a SCALE', () => {
    const scale = makeDevice({ deviceType: 'SCALE', deviceVersion: 'Aria Air' });
    const tracker = makeDevice({ deviceType: 'TRACKER', deviceVersion: 'Charge 6' });
    expect(pickPrimaryDevice([scale, tracker])).toBe(tracker);
  });

  it('falls back to the first device when no TRACKER is present', () => {
    const scale = makeDevice({ deviceType: 'SCALE', deviceVersion: 'Aria Air' });
    expect(pickPrimaryDevice([scale])).toBe(scale);
  });

  it('returns undefined for an empty list', () => {
    expect(pickPrimaryDevice([])).toBeUndefined();
  });
});
