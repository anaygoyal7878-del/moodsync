/**
 * For each `MusicPlayLog` row old enough to plausibly reveal whether the
 * user skipped it, calls Spotify's `/me/player/currently-playing` and
 * sets `likedSignal`: true if the same playlist context is still
 * playing (a proxy for "didn't skip"), false if it changed or stopped
 * (a proxy for "skipped") — documented as a proxy, not a certain signal,
 * since Spotify doesn't expose an explicit skip event. Feeds
 * ai/src/recommendations.ts's playlist skip-rate heuristic. Run this a
 * few minutes after playback via `npm run start:spotify-playback-check
 * -w workers` — same "periodic tick, only touch real rows" shape as
 * weeklyReportWorker.ts/notificationDigestWorker.ts.
 */
import { musicPlayLogRepository, smartHomeConnectionRepository, oauthTokenRepository } from '@moodsync/database';
import { SpotifyClient, refreshSpotifyToken, type SpotifyOAuthConfig } from '@moodsync/integration-spotify';

const CHECK_DELAY_MS = 5 * 60_000; // wait 5 minutes after play before checking
const TOKEN_REFRESH_BUFFER_MS = 5 * 60_000;

function requireSpotifyConfig(): SpotifyOAuthConfig {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI must be set to run this worker');
  }
  return { clientId, clientSecret, redirectUri };
}

/** Same transparent-refresh duplication rationale as
 * ai/src/spotifyActionExecutor.ts's equivalent — this package can't
 * reach into the backend app's internals. */
async function getFreshAccessToken(oauthTokenId: string, config: SpotifyOAuthConfig): Promise<string | null> {
  const tokens = await oauthTokenRepository.getDecrypted(oauthTokenId);
  if (!tokens) return null;

  if (tokens.expiresAt.getTime() - Date.now() > TOKEN_REFRESH_BUFFER_MS) return tokens.accessToken;
  if (!tokens.refreshToken) return null;

  const refreshed = await refreshSpotifyToken(config, tokens.refreshToken);
  await oauthTokenRepository.update(oauthTokenId, {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
    scope: refreshed.scope,
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
  });
  return refreshed.access_token;
}

const config = requireSpotifyConfig();
const cutoff = new Date(Date.now() - CHECK_DELAY_MS);
const pending = await musicPlayLogRepository.listUncheckedOlderThan(cutoff);
console.log(`[spotify-playback-check] Found ${pending.length} unchecked play(s) older than ${CHECK_DELAY_MS / 60_000}m`);

let checked = 0;
let skipped = 0;
for (const log of pending) {
  try {
    const connection = await smartHomeConnectionRepository.findByUserAndProvider(log.userId, 'SPOTIFY');
    if (!connection?.oauthTokenId) {
      skipped++;
      continue; // no connection anymore — leave likedSignal null, nothing to check against
    }

    const accessToken = await getFreshAccessToken(connection.oauthTokenId, config);
    if (!accessToken) {
      // Missing/expired-with-no-refresh, or (for a connection made before
      // `user-read-currently-playing` was added to SPOTIFY_SCOPES) the
      // stored token simply doesn't have this scope — Spotify 403s that
      // case rather than failing token refresh, so it's caught below.
      skipped++;
      continue;
    }

    const client = new SpotifyClient(accessToken);
    const { isPlaying, contextUri } = await client.getCurrentlyPlaying();
    const stillPlayingSameContext = isPlaying && contextUri === log.playlistUri;
    await musicPlayLogRepository.setLikedSignal(log.id, stillPlayingSameContext);
    checked++;
  } catch (error) {
    // A 403 here most often means the connection predates the
    // `user-read-currently-playing` scope (see oauth.ts) — leave
    // likedSignal null rather than guessing, consistent with this
    // worker's "proxy, not certainty" framing.
    skipped++;
    console.error(`[spotify-playback-check] log=${log.id} failed:`, error instanceof Error ? error.message : error);
  }
}

console.log(`[spotify-playback-check] Done. Checked ${checked}, left ${skipped} unresolved.`);
