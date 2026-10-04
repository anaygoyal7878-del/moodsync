/**
 * Historical stub — superseded, kept only because removing an exported
 * package surface is a separate change.
 *
 * Apple Music *is* connectable now, through a path that sidesteps the
 * blocker this stub described: rather than forcing MusicKit's
 * developer-JWT + user-token model into the OAuth-shaped `OAuthToken`
 * table, it has its own `AppleMusicConnection` model. The live pieces:
 *
 *  - backend/src/services/appleMusicService.ts — signs the developer
 *    token, stores the Music User Token encrypted.
 *  - backend/src/api/routes/integrations/appleMusic.ts — developer
 *    token, connect, status, disconnect.
 *  - frontend/src/lib/musicKitClient.tsx — MusicKit JS in the browser;
 *    authorization and playback happen client-side.
 *
 * What remains true: Apple Music is still not in `SmartHomeProviderId`
 * or the server-side action-executor registry, so automations and the
 * environment composer cannot start Apple Music playback — only the
 * browser can. Nothing references the status object below.
 * */
export interface AppleMusicIntegrationStatus {
  id: 'appleMusic';
  displayName: string;
  availability: 'not_yet_available';
  unavailableReason: string;
}

export const appleMusicIntegrationStatus: AppleMusicIntegrationStatus = {
  id: 'appleMusic',
  displayName: 'Apple Music',
  availability: 'not_yet_available',
  unavailableReason:
    "Apple Music requires MusicKit's developer-JWT + user-token auth model, which doesn't fit MoodSync's OAuth-shaped token storage today — see docs/APPLE_MUSIC_RESEARCH.md. Only Spotify is connectable for music automation right now.",
};
