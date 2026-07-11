import { describe, expect, it } from 'vitest';
import { buildPlayRequestBody } from './client.js';

describe('buildPlayRequestBody', () => {
  it('builds a context_uri payload from a playlist URI', () => {
    expect(buildPlayRequestBody({ playlistUri: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M' })).toEqual({
      context_uri: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M',
    });
  });

  it('does not include deviceId in the request body — it is a query parameter, not a body field', () => {
    const body = buildPlayRequestBody({ playlistUri: 'spotify:playlist:abc', deviceId: 'device-1' });
    expect(body).toEqual({ context_uri: 'spotify:playlist:abc' });
    expect(body).not.toHaveProperty('deviceId');
    expect(body).not.toHaveProperty('device_id');
  });
});
