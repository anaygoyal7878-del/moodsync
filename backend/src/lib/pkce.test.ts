import { describe, expect, it } from 'vitest';
import { generatePkcePair } from './pkce.js';

describe('generatePkcePair', () => {
  it('produces a verifier and a challenge', () => {
    const { codeVerifier, codeChallenge } = generatePkcePair();
    expect(codeVerifier.length).toBeGreaterThan(0);
    expect(codeChallenge.length).toBeGreaterThan(0);
    expect(codeVerifier).not.toBe(codeChallenge);
  });

  it('produces a different pair on every call', () => {
    const a = generatePkcePair();
    const b = generatePkcePair();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeChallenge).not.toBe(b.codeChallenge);
  });

  it('derives the challenge deterministically from the verifier (RFC 7636 S256)', async () => {
    const { createHash } = await import('node:crypto');
    const { codeVerifier, codeChallenge } = generatePkcePair();
    const expected = createHash('sha256').update(codeVerifier).digest('base64url');
    expect(codeChallenge).toBe(expected);
  });
});
