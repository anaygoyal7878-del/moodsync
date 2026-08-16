import { smartHomeConnectionRepository, oauthTokenRepository, musicSessionRepository } from '@moodsync/database';
import {
  SpotifyClient,
  matchPlaylistByKeywords,
  refreshSpotifyToken,
  type SpotifyOAuthConfig,
  type SpotifyPlaylistSummary,
} from '@moodsync/integration-spotify';
import { rankPlaylistsByEffect, type CompletedMusicSession } from './musicMemory.js';
import type { MusicMode } from './musicFeedback.js';

/**
 * Resolves an environment's music intent to a **real playlist URI**.
 *
 * This exists because of a bug worth naming: `environmentComposer.ts`
 * originally emitted `params: { category: 'calm' }`, but
 * `spotify.play_playlist`'s executor requires `params.playlistUri` and
 * throws without it. Every accepted music change would have failed at
 * dispatch. A category is an intent, not an address.
 *
 * The resolution order is the interesting part:
 *
 *  1. **What has actually worked for this user.** `musicMemory.ts`
 *     already ranks playlists by measured biometric effect per mode.
 *     If this person's heart rate reliably comes down with one
 *     specific playlist, that is a better answer than any keyword.
 *  2. **Keyword match against their own playlist names.**
 *  3. **Nothing.** Returning null is a real answer — the composer then
 *     omits music entirely rather than proposing something that cannot
 *     be played.
 *
 * Never invents or searches Spotify's public catalog: MoodSync
 * proposes the user's own music, not a stranger's.
 */

/** Environment intent categories → the keywords used to find a
 * matching playlist name. Ordered by specificity, since
 * `matchPlaylistByKeywords` lets earlier keywords win. */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  calm: ['relax', 'calm', 'chill', 'unwind', 'wind down', 'ambient'],
  focus: ['deep focus', 'focus', 'concentration', 'deep work', 'study'],
  sleep: ['sleep', 'night', 'bedtime', 'lullaby'],
  energizing: ['morning', 'energy', 'upbeat', 'wake up', 'workout'],
  recovery: ['recovery', 'rest', 'restore', 'calm', 'ambient'],
};

/** Which `MusicMode` a category corresponds to, for looking up
 * historical effectiveness. Categories with no matching mode simply
 * skip step 1 and fall through to keyword matching. */
const CATEGORY_TO_MODE: Record<string, MusicMode> = {
  calm: 'RELAX',
  focus: 'FOCUS',
  sleep: 'SLEEP',
  energizing: 'MORNING',
  recovery: 'RECOVERY',
};

const HISTORY_WINDOW_DAYS = 90;

function requireSpotifyConfig(): SpotifyOAuthConfig {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI must be set');
  }
  return { clientId, clientSecret, redirectUri };
}

const TOKEN_REFRESH_BUFFER_MS = 5 * 60_000;

/** Same transparent-refresh duplication rationale as
 * spotifyActionExecutor.ts's equivalent — see that file's comment. */
async function getFreshAccessToken(oauthTokenId: string, config: SpotifyOAuthConfig): Promise<string> {
  const tokens = await oauthTokenRepository.getDecrypted(oauthTokenId);
  if (!tokens) throw new Error('No stored credentials for this connection');
  if (tokens.expiresAt.getTime() - Date.now() > TOKEN_REFRESH_BUFFER_MS) return tokens.accessToken;
  if (!tokens.refreshToken) throw new Error('Spotify access token expired with no refresh token');

  const refreshed = await refreshSpotifyToken(config, tokens.refreshToken);
  await oauthTokenRepository.update(oauthTokenId, {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
    scope: refreshed.scope,
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
  });
  return refreshed.access_token;
}

export interface ResolvedPlaylist {
  uri: string;
  name: string;
  /** Why this one — surfaced in the proposal's reason line so
   * "because it has worked for you before" is visible, not implicit. */
  basis: 'proven_for_you' | 'name_match';
}

/**
 * Chooses the historically most effective playlist for this mode,
 * among the ones the user actually still has.
 *
 * Pure and exported so the preference rule is testable without a
 * Spotify mock. Only considers playlists that *still exist* in the
 * user's library — a playlist that worked wonderfully last year but
 * has since been deleted is not a proposal MoodSync can make.
 */
export function pickProvenPlaylist(
  playlists: SpotifyPlaylistSummary[],
  sessions: CompletedMusicSession[],
  mode: MusicMode,
): SpotifyPlaylistSummary | null {
  // `helped` is the mode-aware direction check musicMemory already
  // computes — a playlist that raised heart rate during a Relax session
  // did not "work", even though its delta is the largest.
  const ranked = rankPlaylistsByEffect(sessions).filter((r) => r.mode === mode && r.helped);
  for (const entry of ranked) {
    const match = playlists.find((p) => p.name.toLowerCase() === entry.label.toLowerCase());
    if (match) return match;
  }
  return null;
}

/**
 * The full resolution. Returns null — never a guess — when Spotify
 * isn't connected, the call fails, or nothing matches.
 */
export async function resolveMusicPlaylist(userId: string, category: string): Promise<ResolvedPlaylist | null> {
  const connection = await smartHomeConnectionRepository.findByUserAndProvider(userId, 'SPOTIFY');
  if (!connection?.oauthTokenId || connection.status !== 'ACTIVE') return null;

  let playlists: SpotifyPlaylistSummary[];
  try {
    const accessToken = await getFreshAccessToken(connection.oauthTokenId, requireSpotifyConfig());
    playlists = await new SpotifyClient(accessToken).listPlaylists();
  } catch {
    // A Spotify outage means no music proposal, not a failed
    // assessment — the rest of the environment still composes.
    return null;
  }
  if (playlists.length === 0) return null;

  const mode = CATEGORY_TO_MODE[category];
  if (mode) {
    try {
      const sessions = (await musicSessionRepository.listCompletedSince(
        userId,
        HISTORY_WINDOW_DAYS,
      )) as unknown as CompletedMusicSession[];
      const proven = pickProvenPlaylist(playlists, sessions, mode);
      if (proven) return { uri: proven.uri, name: proven.name, basis: 'proven_for_you' };
    } catch {
      // History unavailable — fall through to keyword matching rather
      // than losing the proposal entirely.
    }
  }

  const keywords = CATEGORY_KEYWORDS[category];
  if (!keywords) return null;
  const matched = matchPlaylistByKeywords(playlists, keywords);
  return matched ? { uri: matched.uri, name: matched.name, basis: 'name_match' } : null;
}
