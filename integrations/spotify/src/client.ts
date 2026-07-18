/**
 * Spotify Web API playback client. `/me/player/play` request/response
 * shape verified against developer.spotify.com's "Start/Resume Playback"
 * reference — see docs/INTEGRATIONS_RESEARCH.md. `/me/player/currently-playing`
 * shape (`context.uri`, `is_playing`) and its 204-no-body-when-nothing-
 * playing behavior both confirmed against developer.spotify.com's "Get
 * Currently Playing Track" reference.
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

  /** `contextUri: null` covers both "nothing is playing" (a real 204,
   * confirmed empty-body behavior — see class doc comment) and a
   * currently-playing item with no `context` (e.g. a single track played
   * outside any playlist/album context) — callers can't distinguish
   * those two cases from this response alone, which is fine for the one
   * use today (comparing against a specific playlist URI this app
   * itself started). */
  async getCurrentlyPlaying(): Promise<{ isPlaying: boolean; contextUri: string | null }> {
    const res = await fetch(`${BASE_URL}/me/player/currently-playing`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (res.status === 204) return { isPlaying: false, contextUri: null };
    if (!res.ok) {
      throw new SpotifyApiError(`Spotify currently-playing request failed: ${res.status} ${await res.text()}`, res.status);
    }

    const body = (await res.json()) as { is_playing?: boolean; context?: { uri?: string } | null };
    return { isPlaying: body.is_playing ?? false, contextUri: body.context?.uri ?? null };
  }
}
