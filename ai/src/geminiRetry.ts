import { ApiError } from '@google/genai';

/**
 * Retry-with-backoff around a Gemini call.
 *
 * Gemini sheds load with **503 UNAVAILABLE ("the model is overloaded")**,
 * and this is not a quota problem — it is Google-side capacity, it hits
 * every billing tier equally, and paying for a higher tier does not
 * avoid it (a paid user reporting the same thing:
 * https://discuss.ai.google.dev/t/503-the-model-is-overloaded-is-being-counted-against-the-rate-limits/109581).
 * Retrying is the actual remedy, so a single unlucky moment stops
 * costing a user their whole reply.
 *
 * Observed live in this project (Aug 2026): three consecutive direct
 * calls to `gemini-flash-latest` returned 503 within seconds of each
 * other and the same prompt succeeded minutes later. Every one of those
 * was surfaced to the user as "I couldn't work that out just now"
 * because nothing above retried.
 *
 * What is and isn't retried is the whole design here:
 *
 * - **503 / 500 / 504** — transient server-side. Retried.
 * - **400 / 401 / 403 / 404** — a bad key, a bad request, a model that
 *   doesn't exist. Retrying these is pure latency: the second attempt
 *   fails identically. Surfaced immediately.
 * - **429 — deliberately NOT retried.** This looks like the obvious
 *   candidate and isn't. Gemini's free tier caps *per day*
 *   (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, observed at 20
 *   requests/day for gemini-3.7-flash), and neither a daily nor a
 *   per-minute quota clears inside this backoff. Worse, a failed request
 *   still counts against the quota, so retrying an exhausted quota
 *   spends two more of the requests that were already gone. Fail fast
 *   and let the caller surface it.
 *
 * Deliberately short: the caller is usually a person waiting on a text
 * message, so this is bounded to a couple of seconds of added delay
 * rather than the minutes-long backoff a batch job could afford. If
 * every attempt fails the last error is rethrown unchanged, so callers
 * keep whatever error handling they already had.
 */

/** Total attempts, not retries — 3 means the original call plus two
 * more. Past this the delay a person waiting on a reply would notice
 * outweighs the shrinking chance the next one lands. */
const MAX_ATTEMPTS = 3;
/** First backoff. Doubles each attempt: 400ms, then 800ms — under a
 * second and a half of added wait in the worst case. */
const BASE_DELAY_MS = 400;

/** Status codes worth trying again. See the doc comment for why 4xx —
 * 429 very much included — is deliberately absent. */
const RETRYABLE_STATUS = new Set([500, 503, 504]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * True when an error is worth a second attempt.
 *
 * Prefers the SDK's typed `ApiError.status`, and falls back to matching
 * the message text — a fetch-level failure (socket hang up, DNS blip)
 * arrives as a plain `Error` with no status at all, and those are
 * exactly as transient as a 503.
 */
export function isRetryableGeminiError(error: unknown): boolean {
  if (error instanceof ApiError) return RETRYABLE_STATUS.has(error.status);
  if (error instanceof Error) {
    // 429 is excluded here for the same reason it's absent from
    // RETRYABLE_STATUS above.
    if (/\b(500|503|504)\b/.test(error.message)) return true;
    if (/\b429\b|RESOURCE_EXHAUSTED|exceeded your current quota/i.test(error.message)) return false;
    return /overloaded|unavailable|timeout|timed out|socket hang up|ECONNRESET|ETIMEDOUT|fetch failed/i.test(
      error.message,
    );
  }
  return false;
}

/**
 * Runs `call`, retrying transient Gemini failures with exponential
 * backoff. Rethrows the final error unchanged when every attempt fails,
 * and rethrows immediately for anything not worth retrying.
 */
export async function withGeminiRetry<T>(call: () => Promise<T>, label = 'gemini'): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await call();
    } catch (error) {
      lastError = error;
      if (!isRetryableGeminiError(error) || attempt === MAX_ATTEMPTS) throw error;

      const wait = BASE_DELAY_MS * 2 ** (attempt - 1);
      // Logged, not silent: a reply that took three attempts is worth
      // seeing in the logs even though the user never notices.
      console.warn(
        `${label}: transient failure on attempt ${attempt}/${MAX_ATTEMPTS}, retrying in ${wait}ms —`,
        error instanceof Error ? error.message : error,
      );
      await delay(wait);
    }
  }

  throw lastError;
}
