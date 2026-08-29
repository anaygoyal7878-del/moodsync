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
 *
 * `withGeminiRetry` is single-model: it retries the one model it was
 * given. `withGeminiFallback` (below) wraps it across a short list of
 * models sharing one deadline, for the case retry alone can't fix — the
 * model itself is saturated and every retry lands on the same crowd.
 * Built from a live measurement, not a guess: during an outage where
 * every `*-latest` alias and every other 3.x model on this key returned
 * 503 for several minutes straight, `gemini-3.1-flash-lite` answered
 * immediately. See `CLARA_MODEL_CANDIDATES`.
 */

/** Total attempts, not retries — 3 means the original call plus two
 * more. Past this the delay a person waiting on a reply would notice
 * outweighs the shrinking chance the next one lands. */
const MAX_ATTEMPTS = 3;
/** First backoff. Doubles each attempt: 400ms, then 800ms — under a
 * second and a half of added wait in the worst case. */
const BASE_DELAY_MS = 400;

/**
 * Hard ceiling on the whole retry sequence, backoffs included.
 *
 * This is the load-bearing number, and it was added after measuring:
 * an overloaded Gemini took ~30s to *return* each 503, so three
 * attempts stacked into a 94-second wait, and one request sat past 120s.
 * Retrying a slow failure without a deadline doesn't add resilience, it
 * multiplies the outage. A person staring at a text thread has given up
 * long before then — failing honestly at 45s beats succeeding at 120s.
 */
const TOTAL_DEADLINE_MS = 45_000;
/** Per-attempt ceiling, enforced by the caller through the SDK's own
 * `timeout`/`abortSignal` (see `geminiCallOptions`). Bounds a single
 * hung request so one stall can't eat the whole budget. */
export const ATTEMPT_TIMEOUT_MS = 20_000;

/** Status codes worth trying again. See the doc comment for why 4xx —
 * 429 very much included — is deliberately absent. */
const RETRYABLE_STATUS = new Set([500, 503, 504]);

/** Thrown when the whole sequence runs past `TOTAL_DEADLINE_MS`.
 * Distinct from a Gemini error so callers can tell "the model said no"
 * apart from "we ran out of time asking". */
export class GeminiDeadlineError extends Error {
  constructor(elapsedMs: number) {
    super(`Gemini call exceeded the ${TOTAL_DEADLINE_MS}ms deadline after ${elapsedMs}ms`);
    this.name = 'GeminiDeadlineError';
  }
}

/**
 * Per-request options bounding a single attempt, spread into
 * `generateContent`'s `config`. Both are set: `timeout` is the SDK's own
 * ceiling, and `abortSignal` actually severs a socket that stops
 * responding without closing — the case `timeout` alone has been known
 * to miss.
 */
export function geminiCallOptions(timeoutMs: number = ATTEMPT_TIMEOUT_MS): {
  timeout: number;
  abortSignal: AbortSignal;
} {
  return { timeout: timeoutMs, abortSignal: AbortSignal.timeout(timeoutMs) };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The model fallback chain every Clara call site should pass to
 * `withGeminiFallback`, in priority order.
 *
 * `gemini-flash-latest` leads because it's Google's own
 * always-current alias — no code change needed as models get
 * deprecated, which is the whole reason this codebase prefers aliases
 * over dated names (see the git history of this comment for the 404
 * that motivated it). `gemini-3.1-flash-lite` is the fallback: a dated
 * name, so it can itself be deprecated later, but it's what was
 * actually measured to have spare capacity during a live outage where
 * every `*-latest` alias and every other 3.x model on this key
 * returned 503 for several minutes straight. One fallback, not several
 * — each extra candidate is only reachable after the ones before it
 * have burned their own retries and backoff, so a long list mostly adds
 * latency to the failure case rather than real coverage.
 */
export const CLARA_MODEL_CANDIDATES = ['gemini-flash-latest', 'gemini-3.1-flash-lite'] as const;

/** The slice of a Gemini response worth recording. Structurally typed
 * rather than importing the SDK's response type, so this stays usable
 * for any call shape passed through `withGeminiRetry`. */
interface UsageShape {
  modelVersion?: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
}

/**
 * One structured line per successful call: latency, model, and the token
 * triple.
 *
 * This exists because diagnosing Clara meant adding logging mid-outage
 * and then calling the API by hand — "it feels slow" and "it's broken"
 * were indistinguishable from the outside. Two things here are not
 * obvious and are the reason it logs what it logs:
 *
 * - **`thoughtsTokenCount` is the real cost driver.** Thinking tokens
 *   bill at the output rate, and a measured "say hi in 3 words" spent
 *   311 of them on a 5-token answer. Logging output tokens alone would
 *   badly understate the bill.
 * - **`modelVersion` is what the alias actually resolved to.**
 *   `gemini-flash-latest` silently became a 3.x thinking model and broke
 *   every tool call; that drift is invisible unless it's recorded.
 */
function logGeminiUsage(label: string, result: unknown, elapsedMs: number, attempts: number): void {
  const usage = (result as UsageShape | null)?.usageMetadata;
  const modelVersion = (result as UsageShape | null)?.modelVersion;
  // Not every call passed through here returns a Gemini response shape;
  // a missing usage block is normal, not an error.
  if (!usage && !modelVersion) return;

  console.info(`${label}: ok in ${elapsedMs}ms`, {
    attempts,
    model: modelVersion ?? 'unknown',
    promptTokens: usage?.promptTokenCount ?? null,
    outputTokens: usage?.candidatesTokenCount ?? null,
    thinkingTokens: usage?.thoughtsTokenCount ?? null,
    totalTokens: usage?.totalTokenCount ?? null,
  });
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
    // Our own per-attempt timeout firing. The SDK surfaces it as
    // `AbortError: This operation was aborted`, which matches none of
    // the wording below — so without this an attempt we cancelled for
    // being slow was treated as a hard failure and never retried, which
    // defeats the point of bounding it. "Too slow this time" is the
    // definition of transient.
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return true;
    return /overloaded|unavailable|timeout|timed out|aborted|socket hang up|ECONNRESET|ETIMEDOUT|fetch failed/i.test(
      error.message,
    );
  }
  return false;
}

/**
 * Runs `call`, retrying transient Gemini failures with exponential
 * backoff. Rethrows the final error unchanged when every attempt fails,
 * and rethrows immediately for anything not worth retrying.
 *
 * `deadlineAtMs` is an absolute timestamp, not a duration — internal,
 * so `withGeminiFallback` can hand every model candidate a *shared*
 * clock instead of each one getting its own fresh `TOTAL_DEADLINE_MS`
 * (which would let N candidates cost N times the budget). Callers of
 * `withGeminiRetry` directly don't pass this; it defaults to "now plus
 * the normal budget", which is the single-model behavior this had
 * before fallback existed.
 *
 * `maxAttempts` is the other fallback-only knob, and it exists because
 * of a real measured failure: with the default 3 attempts, a single
 * saturated model can burn the *entire* 45s deadline before
 * `withGeminiFallback` ever gets to try the next candidate — an attempt
 * that genuinely hangs for the full `ATTEMPT_TIMEOUT_MS` costs as much
 * as the whole point of having a second model. `withGeminiFallback`
 * passes 1 for every candidate except the last, so breadth (try another
 * model) wins over depth (retry the same one three times) — the last
 * candidate has nowhere left to fall back to, so it gets the full
 * budget instead.
 */
export async function withGeminiRetry<T>(
  call: () => Promise<T>,
  label = 'gemini',
  deadlineAtMs: number = Date.now() + TOTAL_DEADLINE_MS,
  maxAttempts: number = MAX_ATTEMPTS,
): Promise<T> {
  const startedAt = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await call();
      logGeminiUsage(label, result, Date.now() - startedAt, attempt);
      return result;
    } catch (error) {
      lastError = error;
      if (!isRetryableGeminiError(error) || attempt === maxAttempts) throw error;

      const wait = BASE_DELAY_MS * 2 ** (attempt - 1);
      // Stop if the next attempt plus its backoff can't finish before
      // the deadline. Checked *before* sleeping, so we never burn the
      // backoff only to abandon the attempt it was waiting for — and it
      // budgets the attempt's own worst case (ATTEMPT_TIMEOUT_MS), not
      // just the sleep. Counting only the sleep let a 20s attempt start
      // right before the deadline and blow straight through it, which
      // is the whole thing this is meant to prevent.
      const elapsed = Date.now() - startedAt;
      if (Date.now() + wait + ATTEMPT_TIMEOUT_MS > deadlineAtMs) {
        console.warn(`${label}: out of time after ${elapsed}ms — giving up rather than retrying into the deadline`);
        throw new GeminiDeadlineError(elapsed);
      }

      // Logged, not silent: a reply that took three attempts is worth
      // seeing in the logs even though the user never notices.
      console.warn(
        `${label}: transient failure on attempt ${attempt}/${maxAttempts} (${elapsed}ms elapsed), retrying in ${wait}ms —`,
        error instanceof Error ? error.message : error,
      );
      await delay(wait);
    }
  }

  throw lastError;
}

/** True for a 404 that means "this model name doesn't exist / isn't
 * available to this project" — Gemini's own deprecation message shape
 * ("no longer available to new users", "no longer available", pointing
 * at a replacement model). Distinct from `isRetryableGeminiError`: a 404
 * is not worth a same-model retry (the next attempt fails identically),
 * but it *is* a reason to try the next model candidate in a fallback
 * list, since the problem is this specific name, not the request. */
function isModelUnavailable(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 404;
  return error instanceof Error && /\b404\b|NOT_FOUND|no longer available/i.test(error.message);
}

/**
 * Tries each model in `models`, in order, sharing one total deadline —
 * `withGeminiRetry`'s own backoff runs *within* each candidate, so a
 * flaky-but-not-dead model still gets its fair 3 attempts before
 * fallback moves on.
 *
 * Built from a live, measured gap, not a guess: during an outage where
 * `gemini-flash-latest` (and every other 3.x model checked) returned
 * 503 for several minutes straight, `gemini-3.1-flash-lite` on the same
 * key answered normally and immediately. Model-wide capacity crunches
 * don't hit every model at once — this is what lets a request survive
 * one that's currently hot without the caller waiting out the whole
 * outage on it.
 *
 * Falls through to the next candidate on a retryable failure (503-class,
 * or our own timeout) once THIS model's retries are exhausted, and on a
 * 404 (`isModelUnavailable`) immediately, since a same-model retry can't
 * fix a name that doesn't exist. Anything else — a bad key, a malformed
 * request, quota exhaustion — fails on the first candidate and stops:
 * every other model would reject it identically, so trying the rest is
 * pure latency, exactly like `isRetryableGeminiError`'s reasoning for a
 * single model. A deadline that expires mid-list stops the list too;
 * one honest timeout beats grinding through the remaining candidates
 * with no time left to actually call any of them.
 */
export async function withGeminiFallback<T>(
  models: readonly string[],
  callFactory: (model: string) => Promise<T>,
  label = 'gemini',
): Promise<T> {
  if (models.length === 0) throw new Error('withGeminiFallback needs at least one model candidate');

  const startedAt = Date.now();
  const deadlineAtMs = startedAt + TOTAL_DEADLINE_MS;
  let lastError: unknown;

  for (let i = 0; i < models.length; i++) {
    const model = models[i]!;
    const isLastCandidate = i === models.length - 1;
    // Out of time is its own error, not whatever the last real model
    // happened to say — a caller checking "did the model refuse" vs
    // "did we run out of time asking" needs that distinction to hold
    // even when the deadline trips between candidates rather than mid-
    // attempt (single-attempt non-final candidates skip the in-attempt
    // deadline check entirely, so this is the only place that catches
    // "the previous hang already used up the whole budget").
    if (Date.now() >= deadlineAtMs) throw new GeminiDeadlineError(Date.now() - startedAt);

    try {
      // Every candidate but the last gets exactly one attempt: a model
      // that's genuinely down should be left behind fast so there's
      // still time to reach the next one, rather than spending the
      // deadline retrying it three times over. The last candidate has
      // nowhere left to fall back to, so it gets the normal full budget
      // instead of failing fast for no benefit.
      return await withGeminiRetry(() => callFactory(model), `${label}[${model}]`, deadlineAtMs, isLastCandidate ? undefined : 1);
    } catch (error) {
      lastError = error;
      if (error instanceof GeminiDeadlineError) throw error;
      if (!isRetryableGeminiError(error) && !isModelUnavailable(error)) throw error;
      console.warn(`${label}: ${model} unavailable, trying next candidate —`, error instanceof Error ? error.message : error);
    }
  }

  throw lastError;
}
