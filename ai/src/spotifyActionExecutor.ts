import { smartHomeConnectionRepository, oauthTokenRepository, musicPlayLogRepository } from '@moodsync/database';
import { SpotifyClient, refreshSpotifyToken, type SpotifyOAuthConfig } from '@moodsync/integration-spotify';
import type { AutomationAction } from '@moodsync/shared';

function requireSpotifyConfig(): SpotifyOAuthConfig {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI must be set to dispatch Spotify actions');
  }
  return { clientId, clientSecret, redirectUri };
}

const TOKEN_REFRESH_BUFFER_MS = 5 * 60_000;

/** Same transparent-refresh rationale as hueActionExecutor.ts's
 * equivalent — duplicated rather than shared because this package (like
 * workers) can't reach into the backend app's internals. See README.md. */
async function getFreshSpotifyAccessToken(oauthTokenId: string, config: SpotifyOAuthConfig): Promise<string> {
  const tokens = await oauthTokenRepository.getDecrypted(oauthTokenId);
  if (!tokens) throw new Error('No stored credentials for this connection');

  if (tokens.expiresAt.getTime() - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) {
    throw new Error('Spotify access token expired and no refresh token was issued for this connection');
  }

  const refreshed = await refreshSpotifyToken(config, tokens.refreshToken);
  await oauthTokenRepository.update(oauthTokenId, {
    accessToken: refreshed.access_token,
    // Spotify only returns a new refresh_token on some refreshes — keep
    // the existing one otherwise, per docs/INTEGRATIONS_RESEARCH.md.
    refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
    scope: refreshed.scope,
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
  });
  return refreshed.access_token;
}

/** Executes one Spotify action. Only `spotify.play_playlist` exists today
 * — see shared/src/automation.ts's `ActionType` for the full set this
 * would need to grow into if playlist-only control turns out to be too
 * narrow. `ruleId` is optional so existing direct callers (none besides
 * dispatch.ts today) keep working without a rule context; when
 * provided, a successful play logs a `MusicPlayLog` row for the
 * skip-detection worker (workers/src/spotifyPlaybackCheckWorker.ts) to
 * check later. */
export async function executeSpotifyAction(userId: string, action: AutomationAction, ruleId?: string): Promise<void> {
  const connection = await smartHomeConnectionRepository.findByUserAndProvider(userId, 'SPOTIFY');
  if (!connection?.oauthTokenId) throw new Error('No Spotify connection for this user');

  const accessToken = await getFreshSpotifyAccessToken(connection.oauthTokenId, requireSpotifyConfig());
  const client = new SpotifyClient(accessToken);

  switch (action.type) {
    case 'spotify.play_playlist': {
      const { playlistUri, deviceId } = action.params;
      if (typeof playlistUri !== 'string') {
        throw new Error('spotify.play_playlist requires params.playlistUri (string)');
      }
      if (deviceId !== undefined && typeof deviceId !== 'string') {
        throw new Error('spotify.play_playlist params.deviceId, if provided, must be a string');
      }
      await client.playPlaylist({ playlistUri, deviceId });
      if (ruleId) await musicPlayLogRepository.logPlay({ userId, ruleId, playlistUri });
      return;
    }
    default:
      throw new Error(`Action type "${action.type}" is not a Spotify action`);
  }
}
