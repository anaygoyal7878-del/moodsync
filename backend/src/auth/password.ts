import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id via @node-rs/argon2 (prebuilt native bindings, no node-gyp
 * compile step — chosen over the `argon2` package specifically to avoid
 * fragile native builds in CI/deploy images). Argon2id is OWASP's current
 * recommended default for password hashing over bcrypt.
 */
const HASH_OPTIONS = {
  memoryCost: 19456, // ~19 MiB, OWASP's current minimum recommendation
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, HASH_OPTIONS);
}

export async function verifyPassword(hashValue: string, plaintext: string): Promise<boolean> {
  return verify(hashValue, plaintext);
}
