import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPlayRequestBody, SpotifyClient } from './client.js';

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

describe('SpotifyClient.getCurrentlyPlaying', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns not-playing for a 204 (the real "nothing playing" response, confirmed empty-body)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const result = await new SpotifyClient('token').getCurrentlyPlaying();
    expect(result).toEqual({ isPlaying: false, contextUri: null });
  });

  it('parses is_playing and context.uri from a real 200 response shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ is_playing: true, context: { uri: 'spotify:playlist:abc' } }), { status: 200 }),
      ),
    );
    const result = await new SpotifyClient('token').getCurrentlyPlaying();
    expect(result).toEqual({ isPlaying: true, contextUri: 'spotify:playlist:abc' });
  });

  it('returns a null contextUri when the response has no context', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ is_playing: true }), { status: 200 })));
    const result = await new SpotifyClient('token').getCurrentlyPlaying();
    expect(result).toEqual({ isPlaying: true, contextUri: null });
  });
});
