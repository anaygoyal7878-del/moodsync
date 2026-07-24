import { SignJWT, importPKCS8 } from 'jose';
import { appleMusicConnectionRepository, type AppleMusicConnectionSummary } from '@moodsync/database';
import { env } from '../config/env.js';

export class AppleMusicNotConfiguredError extends Error {
  constructor() {
    super(
      'Apple Music integration is not configured on this server (missing MusicKit credentials) — ' +
        'see docs/APPLE_MUSIC_ARCHITECTURE.md',
    );
  }
}

interface AppleMusicConfig {
  teamId: string;
  keyId: string;
  privateKey: string;
}

function requireAppleMusicConfig(): AppleMusicConfig {
  if (!env.APPLE_MUSIC_TEAM_ID || !env.APPLE_MUSIC_KEY_ID || !env.APPLE_MUSIC_PRIVATE_KEY) {
    throw new AppleMusicNotConfiguredError();
  }
  return { teamId: env.APPLE_MUSIC_TEAM_ID, keyId: env.APPLE_MUSIC_KEY_ID, privateKey: env.APPLE_MUSIC_PRIVATE_KEY };
}

/** Apple documents a maximum developer-token lifetime of 6 months (15777000
 * seconds). MoodSync mints one far short of that ceiling and re-signs on
 * every request instead of caching — ES256 signing is cheap, and a short
 * TTL bounds the blast radius of a leaked token without needing any
 * revocation mechanism (there isn't one for this token type). */
const DEVELOPER_TOKEN_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export const appleMusicService = {
  /**
   * Signs the "developer token" MusicKit JS needs to call `configure()`
   * in the browser — this authenticates MoodSync itself to Apple's
   * MusicKit service, not any individual user (see
   * docs/APPLE_MUSIC_ARCHITECTURE.md §2). Every logged-in MoodSync user
   * gets the same token; it carries no userId.
   */
  async issueDeveloperToken(): Promise<{ token: string; expiresInSeconds: number }> {
    const config = requireAppleMusicConfig();
    const privateKey = await importPKCS8(config.privateKey, 'ES256');

    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: config.keyId })
      .setIssuer(config.teamId)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + DEVELOPER_TOKEN_TTL_SECONDS)
      .sign(privateKey);

    return { token, expiresInSeconds: DEVELOPER_TOKEN_TTL_SECONDS };
  },

  /**
   * Called once MusicKit JS's `music.authorize()` succeeds in the
   * browser and hands back a Music User Token — MoodSync's backend never
   * participates in that authorization step itself (no redirect, no
   * callback route exists for this provider), it only receives and
   * stores the result.
   */
  async connect(userId: string, musicUserToken: string, storefront: string | undefined): Promise<void> {
    // Doesn't strictly require APPLE_MUSIC_* to be configured to persist
    // a token the frontend already obtained directly from Apple — but a
    // token obtained without a valid developer token couldn't have been
    // issued in the first place, so this can only be reached for real
    // once the server is configured. No explicit config check needed
    // here; requireAppleMusicConfig() already gated issueDeveloperToken.
    await appleMusicConnectionRepository.upsertConnection({ userId, musicUserToken, storefront });
  },

  async getConnection(userId: string): Promise<AppleMusicConnectionSummary | null> {
    return appleMusicConnectionRepository.findByUser(userId);
  },

  async disconnect(userId: string): Promise<boolean> {
    return appleMusicConnectionRepository.disconnect(userId);
  },
};
