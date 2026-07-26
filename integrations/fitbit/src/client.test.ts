import { describe, expect, it, vi } from 'vitest';
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

describe('GoogleHealthClient request retry behavior', () => {
  it('retries a 429 (honoring Retry-After) and succeeds on the next attempt', async () => {
    const { GoogleHealthClient } = await import('./client.js');
    let calls = 0;
    const fetchMock = async () => {
      calls++;
      if (calls === 1) {
        return new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } });
      }
      return new Response(JSON.stringify({ pairedDevices: [] }), { status: 200 });
    };
    vi.stubGlobal('fetch', fetchMock);

    const client = new GoogleHealthClient('token');
    const devices = await client.listPairedDevices();

    expect(devices).toEqual([]);
    expect(calls).toBe(2);
    vi.unstubAllGlobals();
  });

  it('does not retry a non-retryable 401 and throws immediately', async () => {
    const { GoogleHealthClient, GoogleHealthApiError } = await import('./client.js');
    let calls = 0;
    const fetchMock = async () => {
      calls++;
      return new Response('unauthorized', { status: 401 });
    };
    vi.stubGlobal('fetch', fetchMock);

    const client = new GoogleHealthClient('token');
    await expect(client.listPairedDevices()).rejects.toBeInstanceOf(GoogleHealthApiError);
    expect(calls).toBe(1);
    vi.unstubAllGlobals();
  });
});
