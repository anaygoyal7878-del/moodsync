import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';
import type { SmartHomeProviderId, WearableProviderId } from '@moodsync/shared';

const stateSecret = new TextEncoder().encode(env.OAUTH_STATE_SECRET);
const STATE_TTL = '10m'; // generous enough for a user to complete a provider's consent screen

export type OAuthProviderId = WearableProviderId | SmartHomeProviderId;

export interface OAuthStatePayload {
  userId: string;
  provider: OAuthProviderId;
  codeVerifier: string;
  /** Where to send the browser after the callback completes, so the
   * frontend can be a single-page app without the backend hardcoding a
   * post-connect URL per provider. */
  returnTo: string;
}

/**
 * Encodes everything the callback handler needs (who initiated this, which
 * provider, the PKCE verifier, where to redirect back to) into a signed,
 * short-lived JWT passed as the OAuth `state` parameter. This avoids a
 * separate "pending OAuth flows" database table — the state token IS the
 * pending-flow record, self-contained and tamper-evident.
 */
export async function createOAuthState(payload: OAuthStatePayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(STATE_TTL)
    .sign(stateSecret);
}

export class InvalidOAuthStateError extends Error {}

export async function verifyOAuthState(state: string): Promise<OAuthStatePayload> {
  try {
    const { payload } = await jwtVerify(state, stateSecret);
    if (
      typeof payload.userId !== 'string' ||
      typeof payload.provider !== 'string' ||
      typeof payload.codeVerifier !== 'string' ||
      typeof payload.returnTo !== 'string'
    ) {
      throw new InvalidOAuthStateError('State token is missing required fields');
    }
    return {
      userId: payload.userId,
      provider: payload.provider as OAuthProviderId,
      codeVerifier: payload.codeVerifier,
      returnTo: payload.returnTo,
    };
  } catch (error) {
    if (error instanceof InvalidOAuthStateError) throw error;
    throw new InvalidOAuthStateError('OAuth state is invalid or expired — the connect flow may have timed out');
  }
}
