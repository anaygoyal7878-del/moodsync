import { describe, expect, it } from 'vitest';
import {
  verifyAlexaRequest,
  validateCertChainUrl,
  validateTimestamp,
  AlexaRequestVerificationError,
} from './verifyRequest.js';

/**
 * A genuine, freshly-generated X.509 root CA + leaf certificate (leaf's
 * SAN covers echo-api.amazon.com, matching what Amazon's real signing
 * certificates carry) and a real RSA-SHA256 signature of a fixed test
 * body, produced via OpenSSL and Node's own `crypto.createSign` during
 * this integration's test-writing pass — not Amazon's real production
 * certificates (there is no way to obtain those without a live,
 * certified skill — see verifyRequest.ts's doc comment). This proves the
 * verification ALGORITHM (URL validation, chain-of-trust walking,
 * RSA-SHA256 signature math, SAN checking) is implemented correctly;
 * exercising it against genuine Amazon traffic is a separate, later step
 * documented in docs/ALEXA_DEVELOPER_GUIDE.md.
 */
const ROOT_PEM = `-----BEGIN CERTIFICATE-----
MIICvDCCAaQCCQD3NtEVHf8DQjANBgkqhkiG9w0BAQsFADAgMR4wHAYDVQQDDBVN
b29kU3luYyBUZXN0IFJvb3QgQ0EwHhcNMjYwNzEyMTYwNzA3WhcNMzYwNzA5MTYw
NzA3WjAgMR4wHAYDVQQDDBVNb29kU3luYyBUZXN0IFJvb3QgQ0EwggEiMA0GCSqG
SIb3DQEBAQUAA4IBDwAwggEKAoIBAQDXWtyJEunJFCDShftcfSvQBmisLwZACuek
t7f4zvYdDSnukaERTEiYWzGUM0/laeDjv6cXCYZdK/OoBd75NvWGAvww2MoWKtui
AzsuAaNolJHguTrlmhl5hKPd1fUp3B/AFxK3k89AHHMKGKAn4WZ7Ge3/0d8mEf2U
8BOvMGe356fuOMtO8AfHbnnirBEpITfKPIsf+oJKkjAi+x4QZzKHDJv6/Cmj0y/f
hG4NxvHtEgCvg28a/QTmw72Yi+hs5JLAABEbXNCec6/zDsUj/J/HE6A/jHGx1Mi3
/hxuXm5/nG6o5ilBQndtHRaTawrdpCNiROQGp8gyoM9NmmO0UU7ZAgMBAAEwDQYJ
KoZIhvcNAQELBQADggEBAF1Hqh0cvnM7i4x0uAeDzPVaXyUulQys3qk2WumzRr+C
KbGzWkjLU7q2fmGgyCILv0IV9yWNBkKZeFYFa73rC3E3ymyt/0Uz6K4BigHVVKhZ
H9Rt25ZpRAY5ILrihbIfKZ4/NhsJTPRyGWcbr6IHq+j2FADnwaCuSGJtyuhIGsv6
6i2cuA0VdBvW9qII/rixdxdrt+gDAdAiojr3MFP3Ax0z8xCqHa2TnZ37GG0lRH9a
M/Yq+PljNIq87ZVCB/4SW+yKKDnWfGC4zMIrkI5S0tY5HrZrwhsQHnPmPfKJB4Fj
xNwTrzC+RXDN3aEc4Pmf6M2wJWl8S2XR9TdKv+vXG5Q=
-----END CERTIFICATE-----`;

const LEAF_PEM = `-----BEGIN CERTIFICATE-----
MIIC4zCCAcugAwIBAgIJAJ4qtiaxrq1hMA0GCSqGSIb3DQEBCwUAMCAxHjAcBgNV
BAMMFU1vb2RTeW5jIFRlc3QgUm9vdCBDQTAeFw0yNjA3MTIxNjA3MDdaFw0zNjA3
MDkxNjA3MDdaMB4xHDAaBgNVBAMME2VjaG8tYXBpLmFtYXpvbi5jb20wggEiMA0G
CSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCmgOc9DsSR0YOXxh59NoZNK5H0BA5o
8X9A6IIA40i5sWHcxU2jZwb/khQ1vdWuxu78RfAws+brwWnQLeoNwqRNdMLfZdn/
XzNE6Dhhtmk+qlVmyDnGiU+HiFWib57G78AmN+nKbgwHahDQSise/cN4wSqG4/pP
2OHRUNqp9i3iFQtLJwjtmfpgNXQnzlVX2P2wltgH+C9AcSqg1bsw1205wNg4feKj
MddRBxvDQnKPgvHN4Wk5g53xSiutXv//etMOQ+x1I9Z+U6BkaV++OJEH0E/ekPcB
0ZJoiRgfqNHs/Hl7AaGvN+zJwuZK4lP+OkDNyTHFIFwOkpv2fY/H1WNdAgMBAAGj
IjAgMB4GA1UdEQQXMBWCE2VjaG8tYXBpLmFtYXpvbi5jb20wDQYJKoZIhvcNAQEL
BQADggEBALZefU6az2zcoBeFOpN5oSXxZPutMvzfQgb5L1WUhrUZjleS2owMJ5BX
0Qr6ThoCRDwknsikP6gRJRAZjfxc2VdnFL2BD0weIBgx+aJ6YN8rnKd5YXSq1Bmi
VTuMwigdn82Pkwf0hNFXLE4aPgWrMtt9HLjlUPiv3fgvpFPtcQwDCfGTFnzWiR3V
CMoxGZIWYr8/WdTSZxdadvggnkNEv3cAM0eBXknZtitbdn7TU1g2cjVwNTrm09kj
egCyL9iSJBDAKW3y0MivWNtBblSOGN6mlzN9IrjkT7KTmglK8fRVp0HkVZVal2iS
DeSYOx5gupsm+S85ySV9hX1THxue+uI=
-----END CERTIFICATE-----`;

const TEST_BODY = '{"request":{"timestamp":"PLACEHOLDER"}}';
const TEST_SIGNATURE =
  'fH0IU9Perfd9FRu4POWGXLw/KcFQKQoixyC6rTtVPNBMB4QZNnhS/rop+Mh0rUmJqFkKmy9G7j8LpVwHXZBFmpMftSX88Sxg2wFktrWqgQbHpoGgHR11/3KKvZD7dj3UYCHYdxchFbLRCdHhD5aXUsof3pVKSrtR/3ny1fKmRc21EAZxP/OQTzHT0CvmaMnzSCKUVv3zhnZnFwT8cHfyXvdrzHuDxY3gu2f0QnBi41+j61gGw3bRQ16ZWjKDt2hdnE/klI0JWHuAR9Hz6qu6grG5SepJBP+Qh7p1bLRz6pAKVJpjFlXx84yNUZsfilQdpel8OvxIR+WFIlizp/yvag==';

const VALID_CERT_CHAIN_URL = 'https://s3.amazonaws.com/echo.api/echo-api-cert-chain.pem';

function freshTimestamp(): string {
  return new Date().toISOString();
}

describe('validateCertChainUrl', () => {
  it('accepts a well-formed Amazon URL', () => {
    expect(() => validateCertChainUrl(VALID_CERT_CHAIN_URL)).not.toThrow();
  });

  it('rejects a non-https URL', () => {
    expect(() => validateCertChainUrl('http://s3.amazonaws.com/echo.api/cert.pem')).toThrow(AlexaRequestVerificationError);
  });

  it('rejects a spoofed hostname', () => {
    expect(() => validateCertChainUrl('https://attacker.com/echo.api/cert.pem')).toThrow(AlexaRequestVerificationError);
  });

  it('rejects a path not starting with /echo.api/', () => {
    expect(() => validateCertChainUrl('https://s3.amazonaws.com/not-echo-api/cert.pem')).toThrow(AlexaRequestVerificationError);
  });

  it('rejects a non-443 port', () => {
    expect(() => validateCertChainUrl('https://s3.amazonaws.com:8443/echo.api/cert.pem')).toThrow(AlexaRequestVerificationError);
  });

  it('rejects a malformed URL', () => {
    expect(() => validateCertChainUrl('not a url')).toThrow(AlexaRequestVerificationError);
  });
});

describe('validateTimestamp', () => {
  it('accepts a timestamp within the 150-second window', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(() => validateTimestamp('2026-01-01T00:02:00Z', now)).not.toThrow();
  });

  it('rejects a timestamp older than 150 seconds', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(() => validateTimestamp('2026-01-01T00:03:01Z', now)).toThrow(AlexaRequestVerificationError);
  });

  it('rejects a timestamp in the future beyond the window', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(() => validateTimestamp('2025-12-31T23:56:00Z', now)).toThrow(AlexaRequestVerificationError);
  });

  it('rejects an unparseable timestamp', () => {
    expect(() => validateTimestamp('not-a-date')).toThrow(AlexaRequestVerificationError);
  });
});

describe('verifyAlexaRequest (full pipeline against a synthetic cert chain)', () => {
  it('resolves for a genuinely valid signature, chain, and timestamp', async () => {
    await expect(
      verifyAlexaRequest({
        signatureCertChainUrl: VALID_CERT_CHAIN_URL,
        signature: TEST_SIGNATURE,
        rawBody: TEST_BODY,
        requestTimestamp: freshTimestamp(),
        fetchCertChain: async () => `${LEAF_PEM}\n${ROOT_PEM}`,
        trustedRoots: [ROOT_PEM],
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects when the body has been tampered with after signing', async () => {
    await expect(
      verifyAlexaRequest({
        signatureCertChainUrl: VALID_CERT_CHAIN_URL,
        signature: TEST_SIGNATURE,
        rawBody: '{"request":{"timestamp":"TAMPERED"}}',
        requestTimestamp: freshTimestamp(),
        fetchCertChain: async () => `${LEAF_PEM}\n${ROOT_PEM}`,
        trustedRoots: [ROOT_PEM],
      }),
    ).rejects.toThrow(AlexaRequestVerificationError);
  });

  it('rejects when the signature itself is garbage', async () => {
    await expect(
      verifyAlexaRequest({
        signatureCertChainUrl: VALID_CERT_CHAIN_URL,
        signature: Buffer.from('not a real signature').toString('base64'),
        rawBody: TEST_BODY,
        requestTimestamp: freshTimestamp(),
        fetchCertChain: async () => `${LEAF_PEM}\n${ROOT_PEM}`,
        trustedRoots: [ROOT_PEM],
      }),
    ).rejects.toThrow(AlexaRequestVerificationError);
  });

  it('rejects when the chain does not lead to a trusted root', async () => {
    await expect(
      verifyAlexaRequest({
        signatureCertChainUrl: VALID_CERT_CHAIN_URL,
        signature: TEST_SIGNATURE,
        rawBody: TEST_BODY,
        requestTimestamp: freshTimestamp(),
        fetchCertChain: async () => `${LEAF_PEM}\n${ROOT_PEM}`,
        trustedRoots: [], // no trusted roots configured — nothing can chain to trust
      }),
    ).rejects.toThrow(AlexaRequestVerificationError);
  });

  it('rejects when the request timestamp is stale, before ever fetching the cert chain', async () => {
    let fetchCalled = false;
    await expect(
      verifyAlexaRequest({
        signatureCertChainUrl: VALID_CERT_CHAIN_URL,
        signature: TEST_SIGNATURE,
        rawBody: TEST_BODY,
        requestTimestamp: '2000-01-01T00:00:00Z',
        fetchCertChain: async () => {
          fetchCalled = true;
          return `${LEAF_PEM}\n${ROOT_PEM}`;
        },
        trustedRoots: [ROOT_PEM],
      }),
    ).rejects.toThrow(AlexaRequestVerificationError);
    expect(fetchCalled).toBe(false);
  });

  it('rejects an invalid SignatureCertChainUrl before fetching anything', async () => {
    await expect(
      verifyAlexaRequest({
        signatureCertChainUrl: 'https://attacker.com/echo.api/cert.pem',
        signature: TEST_SIGNATURE,
        rawBody: TEST_BODY,
        requestTimestamp: freshTimestamp(),
        fetchCertChain: async () => `${LEAF_PEM}\n${ROOT_PEM}`,
        trustedRoots: [ROOT_PEM],
      }),
    ).rejects.toThrow(AlexaRequestVerificationError);
  });
});
