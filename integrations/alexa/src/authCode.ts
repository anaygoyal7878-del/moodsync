import { SignJWT, jwtVerify } from 'jose';

/**
 * MoodSync is the OAuth 2.0 authorization server for this integration
 * (Amazon's Alexa app redirects users to MoodSync's own authorize
 * endpoint — see docs/ALEXA_ARCHITECTURE.md §2/§4), so unlike every other
 * integration's `oauth.ts` (which builds a request to a THIRD PARTY's
 * authorize endpoint), this module issues MoodSync's own authorization
 * codes. Mirrors backend/src/lib/oauthState.ts's exact pattern: the code
 * IS the pending-authorization record (a short-lived signed JWT), so
 * there's no separate "pending Alexa authorizations" database table.
 */

export interface AlexaAuthCodePayload {
  userId: string;
  clientId: string;
  redirectUri: string;
  scope: string;
}

/** Standard OAuth authorization-code lifetime — short enough that a code
 * intercepted in transit is useless within minutes, long enough to cover
 * the redirect round trip through Amazon's servers. */
const AUTH_CODE_TTL = '5m';

export class InvalidAlexaAuthCodeError extends Error {}

export async function signAlexaAuthCode(secret: string, payload: AlexaAuthCodePayload): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(AUTH_CODE_TTL)
    .sign(key);
}

export async function verifyAlexaAuthCode(secret: string, code: string): Promise<AlexaAuthCodePayload> {
  const key = new TextEncoder().encode(secret);
  try {
    const { payload } = await jwtVerify(code, key);
    if (
      typeof payload.userId !== 'string' ||
      typeof payload.clientId !== 'string' ||
      typeof payload.redirectUri !== 'string' ||
      typeof payload.scope !== 'string'
    ) {
      throw new InvalidAlexaAuthCodeError('Authorization code is missing required fields');
    }
    return { userId: payload.userId, clientId: payload.clientId, redirectUri: payload.redirectUri, scope: payload.scope };
  } catch (error) {
    if (error instanceof InvalidAlexaAuthCodeError) throw error;
    throw new InvalidAlexaAuthCodeError('Authorization code is invalid or expired');
  }
}
