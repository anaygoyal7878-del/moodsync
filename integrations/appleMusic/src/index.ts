/**
 * Apple Music is NOT wired into MoodSync's `SmartHomeProviderId` union
 * (shared/src/wearables.ts) or the action-executor registry
 * (ai/src/actionExecutors.ts) — this package intentionally has no live
 * client, same "typed-interface-only stub" pattern as
 * `integrations/garmin` and `integrations/ecobee`. See
 * docs/APPLE_MUSIC_RESEARCH.md for the real finding that blocks this:
 * MusicKit's developer-JWT + user-token auth model doesn't fit the
 * `OAuthToken` Prisma model's OAuth-shaped columns (non-nullable
 * `expiresAt`, a refresh-token flow MusicKit doesn't have), and no live
 * MusicKit API testing has been done. Extending the real
 * `SmartHomeProviderId` union to include this before that's resolved
 * would let the rest of the product (dispatch, rule builder) silently
 * assume a live connection can exist — this local, disconnected status
 * type exists so nothing else in the codebase can reference it as if it
 * were real yet.
 */
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
