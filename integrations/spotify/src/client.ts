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

export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  /** The `spotify:playlist:...` URI — what `playPlaylist` needs as its
   * `context_uri`, so callers never have to construct one by hand. */
  uri: string;
}

/**
 * Picks the playlist best matching any of `keywords`, or null when
 * none match.
 *
 * Pure so the matching rule is testable without a network mock, same
 * pattern as `buildPlayRequestBody` above. Earlier keywords win, so a
 * caller can express priority by ordering — and among equal matches
 * the shortest name wins, since "Deep Focus" is a better answer for
 * "focus" than "Focus Music For Studying And Long Drives".
 */
export function matchPlaylistByKeywords(
  playlists: SpotifyPlaylistSummary[],
  keywords: string[],
): SpotifyPlaylistSummary | null {
  for (const keyword of keywords) {
    const needle = keyword.toLowerCase();
    const matches = playlists.filter((p) => p.name.toLowerCase().includes(needle));
    if (matches.length > 0) {
      return matches.reduce((best, p) => (p.name.length < best.name.length ? p : best));
    }
  }
  return null;
}

export class SpotifyClient {
  constructor(private readonly accessToken: string) {}

  /**
   * The user's own playlists. Requires the `playlist-read-private`
   * scope, which this integration already requests (see
   * SPOTIFY_SCOPES) — no re-consent needed.
   *
   * Single page only: 50 is Spotify's per-request maximum and is far
   * more than keyword matching needs. Paginating would multiply API
   * calls for a feature that's picking one playlist by name.
   */
  async listPlaylists(limit = 50): Promise<SpotifyPlaylistSummary[]> {
    const url = new URL(`${BASE_URL}/me/playlists`);
    url.searchParams.set('limit', String(Math.min(limit, 50)));

    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    if (!res.ok) {
      throw new SpotifyApiError(`Spotify playlist list failed: ${res.status}`, res.status);
    }
    const payload = (await res.json()) as { items?: Array<{ id?: string; name?: string; uri?: string }> };
    return (payload.items ?? [])
      .filter((item): item is { id: string; name: string; uri: string } =>
        typeof item.id === 'string' && typeof item.name === 'string' && typeof item.uri === 'string',
      )
      .map((item) => ({ id: item.id, name: item.name, uri: item.uri }));
  }

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
