/**
 * Spotify Web API playback client. `/me/player/play` request/response
 * shape verified against developer.spotify.com's "Start/Resume Playback"
 * reference — see docs/INTEGRATIONS_RESEARCH.md.
 */

const BASE_URL = 'https://api.spotify.com/v1';

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface PlayPlaylistParams {
  /** A Spotify context URI, e.g. `spotify:playlist:{id}` — confirmed as
   * the `context_uri` field for albums/artists/playlists. */
  playlistUri: string;
  /** Optional target device — if omitted, Spotify targets whichever
   * device already has an active session, per the confirmed docs and
   * the Premium/active-session product constraint noted in
   * docs/MILESTONES.md. */
  deviceId?: string | undefined;
}

/** Pure so it's unit-testable without a network mock — same pattern as
 * `@moodsync/integration-hue`'s `buildLightStatePayload`. */
export function buildPlayRequestBody(params: PlayPlaylistParams): Record<string, unknown> {
  return { context_uri: params.playlistUri };
}

export class SpotifyClient {
  constructor(private readonly accessToken: string) {}

  async playPlaylist(params: PlayPlaylistParams): Promise<void> {
    const url = new URL(`${BASE_URL}/me/player/play`);
    if (params.deviceId) url.searchParams.set('device_id', params.deviceId);

    const res = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPlayRequestBody(params)),
    });

    if (!res.ok) {
      // Confirmed error codes: 401 (bad/expired token), 403 (most often
      // PREMIUM_REQUIRED — Spotify Connect playback control requires
      // Spotify Premium), 429 (rate limited). Surfaced as-is rather than
      // parsed into a typed reason, since the exact error-body `reason`
      // enum wasn't independently confirmed.
      throw new SpotifyApiError(`Spotify playback request failed: ${res.status} ${await res.text()}`, res.status);
    }
  }
}
