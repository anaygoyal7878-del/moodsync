import { X509Certificate, createVerify } from 'node:crypto';
import { rootCertificates } from 'node:tls';

/**
 * Verifies that an HTTP request to `/api/alexa/skill` genuinely came from
 * Amazon's Alexa service, and isn't a replayed old request. Every step
 * mirrors Amazon's own documented algorithm precisely — confirmed against
 * a live fetch of
 * developer.amazon.com/en-US/docs/alexa/custom-skills/host-a-custom-skill-as-a-web-service.html
 * during this integration's design pass, including the exact header
 * names (`SignatureCertChainUrl`, `Signature-256`) and hash algorithm
 * (SHA-256 — Amazon's docs explicitly deprecate the older SHA-1
 * `Signature` header in favor of this one). Implemented with Node's
 * built-in `crypto`/`tls` modules rather than a third-party
 * "alexa-verifier" package: this is a security-critical path, the
 * algorithm is fully specified, and Node's `X509Certificate` API
 * (stable since Node 15.6) is sufficient to implement it directly — see
 * docs/ALEXA_ARCHITECTURE.md §6.
 *
 * **What could not be verified in this environment**: there is no way to
 * obtain a genuine Amazon-signed request (SignatureCertChainUrl pointing
 * at a real S3-hosted Amazon certificate, a real Signature-256 value)
 * without an active, certified skill receiving real traffic. Tests in
 * verifyRequest.test.ts exercise this module's own logic — URL
 * validation, timestamp windowing, certificate-chain walking, and
 * RSA-SHA256 signature math — against a synthetic certificate chain
 * generated in the test itself, which proves the verification algorithm
 * is implemented correctly, but the FIRST real-Amazon-traffic exercise of
 * this code can only happen once a real skill is configured — see
 * docs/ALEXA_DEVELOPER_GUIDE.md.
 */

const EXPECTED_HOSTNAME = 's3.amazonaws.com';
const EXPECTED_PATH_PREFIX = '/echo.api/';
const REQUIRED_SAN = 'echo-api.amazon.com';
/** Amazon's documented replay-attack window. */
const MAX_TIMESTAMP_SKEW_MS = 150_000;

export class AlexaRequestVerificationError extends Error {}

export type CertChainFetcher = (url: string) => Promise<string>;

const defaultFetcher: CertChainFetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new AlexaRequestVerificationError(`Failed to download certificate chain: HTTP ${res.status}`);
  }
  return res.text();
};

/** Step 1 of Amazon's algorithm: the SignatureCertChainUrl must point at
 * Amazon's own S3 bucket — otherwise an attacker could serve their own
 * certificate chain and self-sign a forged request. */
export function validateCertChainUrl(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AlexaRequestVerificationError('SignatureCertChainUrl is not a valid URL');
  }
  if (url.protocol !== 'https:') {
    throw new AlexaRequestVerificationError('SignatureCertChainUrl must use https');
  }
  if (url.hostname.toLowerCase() !== EXPECTED_HOSTNAME) {
    throw new AlexaRequestVerificationError(`SignatureCertChainUrl hostname must be ${EXPECTED_HOSTNAME}`);
  }
  if (!url.pathname.startsWith(EXPECTED_PATH_PREFIX)) {
    throw new AlexaRequestVerificationError(`SignatureCertChainUrl path must start with ${EXPECTED_PATH_PREFIX}`);
  }
  if (url.port && url.port !== '443') {
    throw new AlexaRequestVerificationError('SignatureCertChainUrl port must be 443');
  }
}

/** Amazon's documented replay-attack protection: reject anything more
 * than 150 seconds away from server time (either direction — a clock
 * skew or a stale replayed request both fail the same check). */
export function validateTimestamp(requestTimestampIso: string, now: Date = new Date()): void {
  const requestTime = new Date(requestTimestampIso);
  if (Number.isNaN(requestTime.getTime())) {
    throw new AlexaRequestVerificationError('Request timestamp is not a valid date');
  }
  const skewMs = Math.abs(now.getTime() - requestTime.getTime());
  if (skewMs > MAX_TIMESTAMP_SKEW_MS) {
    throw new AlexaRequestVerificationError('Request timestamp is outside the allowed 150-second window');
  }
}

function splitCertChain(pem: string): string[] {
  const matches = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
  if (!matches || matches.length === 0) {
    throw new AlexaRequestVerificationError('No certificates found in the downloaded certificate chain');
  }
  return matches;
}

/** Steps 3-4 of Amazon's algorithm: the signing (leaf) certificate must
 * currently be valid and cover `echo-api.amazon.com`, and the full chain
 * must lead to a CA root already trusted (Node's bundled CA store by
 * default — the same Mozilla-derived trust store browsers use; injectable
 * for tests, which use a synthetic root instead of a real one). Returns
 * the signing certificate for the caller to verify the signature against. */
function validateCertificateChain(pemCerts: string[], trustedRoots: readonly string[]): X509Certificate {
  const certs = pemCerts.map((pem) => new X509Certificate(pem));
  const signingCert = certs[0]!;

  const now = new Date();
  if (now < new Date(signingCert.validFrom) || now > new Date(signingCert.validTo)) {
    throw new AlexaRequestVerificationError('Signing certificate is not currently valid (outside its validity period)');
  }

  const sans = (signingCert.subjectAltName ?? '').split(',').map((s) => s.trim());
  if (!sans.includes(`DNS:${REQUIRED_SAN}`)) {
    throw new AlexaRequestVerificationError(`Signing certificate does not cover ${REQUIRED_SAN} in its Subject Alternative Names`);
  }

  for (let i = 0; i < certs.length - 1; i++) {
    const cert = certs[i]!;
    const issuer = certs[i + 1]!;
    if (!cert.checkIssued(issuer) || !cert.verify(issuer.publicKey)) {
      throw new AlexaRequestVerificationError(
        `Certificate chain is broken at position ${i} — not signed by the next certificate in the chain`,
      );
    }
  }

  const last = certs[certs.length - 1]!;
  const chainsToTrustedRoot = trustedRoots.some((rootPem) => {
    try {
      const root = new X509Certificate(rootPem);
      if (last.fingerprint256 === root.fingerprint256) return true; // the chain already includes the root itself
      return last.checkIssued(root) && last.verify(root.publicKey);
    } catch {
      return false;
    }
  });
  if (!chainsToTrustedRoot) {
    throw new AlexaRequestVerificationError('Certificate chain does not lead to a trusted root CA');
  }

  return signingCert;
}

/** Steps 6-9 of Amazon's algorithm: verify the Signature-256 header
 * (base64, RSA-SHA256) against the exact raw request body using the
 * signing certificate's public key. `rawBody` must be the untouched
 * bytes Amazon sent — a reserialized JSON string will not match. */
function verifySignature(signingCert: X509Certificate, signatureBase64: string, rawBody: string | Buffer): void {
  const verifier = createVerify('RSA-SHA256');
  verifier.update(rawBody);
  verifier.end();
  const valid = verifier.verify(signingCert.publicKey, signatureBase64, 'base64');
  if (!valid) {
    throw new AlexaRequestVerificationError('Request signature does not match the request body');
  }
}

export interface VerifyAlexaRequestParams {
  signatureCertChainUrl: string;
  signature: string;
  rawBody: string | Buffer;
  requestTimestamp: string;
  now?: Date;
  fetchCertChain?: CertChainFetcher;
  /** Defaults to Node's bundled CA store — override only in tests. */
  trustedRoots?: readonly string[];
}

/** The full verification pipeline required before trusting any request
 * to `/api/alexa/skill`. Throws `AlexaRequestVerificationError` on any
 * failure — see docs/ALEXA_ARCHITECTURE.md §6/§7 for how the route layer
 * should respond to that (HTTP 400, no internal details leaked). */
export async function verifyAlexaRequest(params: VerifyAlexaRequestParams): Promise<void> {
  validateTimestamp(params.requestTimestamp, params.now);
  validateCertChainUrl(params.signatureCertChainUrl);

  const fetchCertChain = params.fetchCertChain ?? defaultFetcher;
  const pem = await fetchCertChain(params.signatureCertChainUrl);
  const pemCerts = splitCertChain(pem);
  const signingCert = validateCertificateChain(pemCerts, params.trustedRoots ?? rootCertificates);

  verifySignature(signingCert, params.signature, params.rawBody);
}
