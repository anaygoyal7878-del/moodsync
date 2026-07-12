import { describe, expect, it } from 'vitest';
import { signAlexaAuthCode, verifyAlexaAuthCode, InvalidAlexaAuthCodeError } from './authCode.js';

const SECRET = 'a'.repeat(32);
const PAYLOAD = { userId: 'user-1', clientId: 'client-1', redirectUri: 'https://pitangui.amazon.com/api/skill/link/v1', scope: 'profile' };

describe('signAlexaAuthCode / verifyAlexaAuthCode', () => {
  it('round-trips the payload', async () => {
    const code = await signAlexaAuthCode(SECRET, PAYLOAD);
    const verified = await verifyAlexaAuthCode(SECRET, code);
    expect(verified).toEqual(PAYLOAD);
  });

  it('rejects a code signed with a different secret', async () => {
    const code = await signAlexaAuthCode(SECRET, PAYLOAD);
    await expect(verifyAlexaAuthCode('b'.repeat(32), code)).rejects.toThrow(InvalidAlexaAuthCodeError);
  });

  it('rejects a tampered code', async () => {
    const code = await signAlexaAuthCode(SECRET, PAYLOAD);
    const middle = Math.floor(code.length / 2);
    const flipped = code[middle] === 'a' ? 'b' : 'a';
    const tampered = code.slice(0, middle) + flipped + code.slice(middle + 1);
    await expect(verifyAlexaAuthCode(SECRET, tampered)).rejects.toThrow(InvalidAlexaAuthCodeError);
  });

  it('rejects garbage input', async () => {
    await expect(verifyAlexaAuthCode(SECRET, 'not-a-real-code')).rejects.toThrow(InvalidAlexaAuthCodeError);
  });
});
