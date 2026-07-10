import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export interface AccessTokenPayload {
  sub: string; // userId
}

/**
 * Only the access token is a JWT (short-lived, stateless, HS256 via jose).
 * The refresh token is deliberately NOT a JWT — see auth/refreshToken.ts —
 * because refresh tokens need to be revocable (logout, rotation, breach
 * response) and a stateless JWT can't be un-issued without a DB check
 * anyway, so there's no benefit to JWT-encoding it over a plain opaque
 * random token.
 */
export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_TOKEN_TTL)
    .sign(accessSecret);
}

export class InvalidAccessTokenError extends Error {}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, accessSecret);
    if (!payload.sub) throw new InvalidAccessTokenError('Token missing subject');
    return { sub: payload.sub };
  } catch {
    throw new InvalidAccessTokenError('Access token is invalid or expired');
  }
}
