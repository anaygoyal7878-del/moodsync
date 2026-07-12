import { SignJWT, jwtVerify } from 'jose';
import { randomBytes } from 'node:crypto';

/**
 * The access/refresh tokens MoodSync's `/api/integrations/alexa/token`
 * endpoint issues to Amazon on account linking (and on every subsequent
 * refresh) — see docs/ALEXA_ARCHITECTURE.md §4. Same split as
 * backend/src/auth/{jwt,refreshToken}.ts: the access token is a
 * short-lived stateless JWT (verified on every voice request with no DB
 * round trip), the refresh token is an opaque random value that must be
 * looked up and is therefore revocable (dashboard disconnect) — a
 * stateless JWT refresh token couldn't be un-issued without a DB check
 * anyway, so there's no benefit to JWT-encoding it.
 */

export interface AlexaAccessTokenPayload {
  userId: string;
}

const ACCESS_TOKEN_TTL = '1h';
/** Matches the skill manifest's `defaultTokenExpirationInSeconds` — see
 * integrations/alexa/src/skillManifest.template.json. Amazon's account
 * linking system calls the refresh_token grant automatically before
 * this expires; MoodSync never needs to push a refresh itself. */
const ACCESS_TOKEN_TTL_SECONDS = 3600;

export class InvalidAlexaAccessTokenError extends Error {}

export async function signAlexaAccessToken(
  secret: string,
  userId: string,
): Promise<{ token: string; expiresInSeconds: number }> {
  const key = new TextEncoder().encode(secret);
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience('alexa-skill')
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(key);
  return { token, expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS };
}

/** `aud: 'alexa-skill'` is checked explicitly so a MoodSync web-session
 * JWT (signed with a different secret AND a different/absent audience
 * claim) can never be replayed as an Alexa access token even if the two
 * secrets were ever accidentally reused — defense in depth, not the only
 * thing standing between the two token types (they're signed with
 * entirely separate secrets — see backend/src/config/env.ts's
 * ALEXA_TOKEN_SECRET vs JWT_ACCESS_SECRET). */
export async function verifyAlexaAccessToken(secret: string, token: string): Promise<AlexaAccessTokenPayload> {
  const key = new TextEncoder().encode(secret);
  try {
    const { payload } = await jwtVerify(token, key, { audience: 'alexa-skill' });
    if (typeof payload.sub !== 'string') throw new InvalidAlexaAccessTokenError('Token missing subject');
    return { userId: payload.sub };
  } catch (error) {
    if (error instanceof InvalidAlexaAccessTokenError) throw error;
    throw new InvalidAlexaAccessTokenError('Access token is invalid or expired');
  }
}

export function generateAlexaRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}
