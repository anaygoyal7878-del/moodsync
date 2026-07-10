/**
 * AES-256-GCM envelope encryption for provider credentials (Moodo/Home
 * Assistant tokens) at rest in `device_provider_credentials`. The key lives
 * only in the Edge Function's environment (CREDENTIALS_ENCRYPTION_KEY,
 * a 32-byte base64 secret set via `supabase secrets set`), never in the
 * database or the client app.
 */

async function importKey(): Promise<CryptoKey> {
  const b64 = Deno.env.get("CREDENTIALS_ENCRYPTION_KEY");
  if (!b64) {
    throw new Error("Missing CREDENTIALS_ENCRYPTION_KEY environment variable");
  }
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (raw.byteLength !== 32) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export interface EncryptedPayload {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
}

export async function encryptCredentials(
  plaintext: Record<string, unknown>,
): Promise<EncryptedPayload> {
  const key = await importKey();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(plaintext));
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    encoded,
  );
  return { ciphertext: new Uint8Array(ciphertextBuf), nonce };
}

export async function decryptCredentials(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
): Promise<Record<string, unknown>> {
  const key = await importKey();
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    ciphertext,
  );
  const json = new TextDecoder().decode(plainBuf);
  return JSON.parse(json);
}
