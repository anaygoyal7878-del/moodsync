import { createHash, randomBytes } from 'node:crypto';

/**
 * RFC 7636 PKCE (Proof Key for Code Exchange). Generated for every OAuth
 * authorization-code flow in this codebase regardless of whether a given
 * provider's docs explicitly require it — it's a strict security
 * improvement with no downside for providers that merely accept-but-don't-require
 * it, and several of our providers' PKCE requirements were unconfirmed in
 * docs/INTEGRATIONS_RESEARCH.md.
 */
export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

export function generatePkcePair(): PkcePair {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}
