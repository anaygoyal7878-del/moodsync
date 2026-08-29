import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError } from '@google/genai';
import { withGeminiRetry, withGeminiFallback, isRetryableGeminiError, geminiCallOptions, GeminiDeadlineError } from './geminiRetry.js';

/** The real shape the SDK throws — the 503 that started this. */
function apiError(status: number, message = 'boom'): ApiError {
  return new ApiError({ message, status });
}

describe('isRetryableGeminiError', () => {
  it('retries the 503 overload that this exists for', () => {
    expect(isRetryableGeminiError(apiError(503, 'The model is overloaded.'))).toBe(true);
  });

  it('retries other transient server statuses', () => {
    for (const status of [500, 504]) {
      expect(isRetryableGeminiError(apiError(status))).toBe(true);
    }
  });

  it('does NOT retry a bad key, a bad request, or a missing model', () => {
    // Retrying these is pure added latency — attempt two fails identically.
    for (const status of [400, 401, 403, 404]) {
      expect(isRetryableGeminiError(apiError(status))).toBe(false);
    }
  });

  it('does NOT retry 429 quota exhaustion, which retrying makes worse', () => {
    // Gemini's free tier caps per *day*; a failed request still counts,
    // so retrying spends more of an allowance that is already gone.
    expect(isRetryableGeminiError(apiError(429, 'You exceeded your current quota'))).toBe(false);
    expect(isRetryableGeminiError(new Error('429 RESOURCE_EXHAUSTED'))).toBe(false);
  });

  it('retries network-level failures that carry no status at all', () => {
    expect(isRetryableGeminiError(new Error('fetch failed'))).toBe(true);
    expect(isRetryableGeminiError(new Error('socket hang up'))).toBe(true);
    expect(isRetryableGeminiError(new Error('ETIMEDOUT'))).toBe(true);
  });

  it('retries our own per-attempt timeout — "too slow" is transient', () => {
    // The SDK surfaces an aborted request as AbortError with a message
    // matching none of the network wording, so this needs its own case.
    const aborted = new Error('This operation was aborted');
    aborted.name = 'AbortError';
    expect(isRetryableGeminiError(aborted)).toBe(true);
  });

  it('does not retry an ordinary programming error', () => {
    expect(isRetryableGeminiError(new TypeError('x is not a function'))).toBe(false);
    expect(isRetryableGeminiError('a string')).toBe(false);
  });
});

describe('withGeminiRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * Runs `promise` while draining the backoff timers it awaits.
   *
   * Handlers are attached synchronously, before the timers advance —
   * otherwise a rejection lands while nothing is listening and Vitest
   * reports it as an unhandled error even though the test passes.
   */
  async function settle<T>(promise: Promise<T>): Promise<T> {
    const tracked = promise.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    await vi.runAllTimersAsync();
    const result = await tracked;
    if (result.ok) return result.value;
    throw result.error;
  }

  it('returns the first result without retrying when the call succeeds', async () => {
    const call = vi.fn().mockResolvedValue('ok');
    await expect(settle(withGeminiRetry(call))).resolves.toBe('ok');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('recovers from a transient 503 — the exact failure that broke Clara', async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce(apiError(503, 'The model is overloaded.'))
      .mockResolvedValue('recovered');

    await expect(settle(withGeminiRetry(call))).resolves.toBe('recovered');
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('keeps trying across several transient failures', async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce(apiError(503))
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValue('third time');

    await expect(settle(withGeminiRetry(call))).resolves.toBe('third time');
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('gives up after the attempt ceiling and rethrows the last error unchanged', async () => {
    const final = apiError(503, 'still overloaded');
    const call = vi.fn().mockRejectedValue(final);

    // Callers' existing error handling depends on the original error
    // surviving, so it must not be wrapped.
    await expect(settle(withGeminiRetry(call))).rejects.toBe(final);
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('fails fast on a non-retryable error instead of burning the budget', async () => {
    const badKey = apiError(401, 'API key not valid');
    const call = vi.fn().mockRejectedValue(badKey);

    await expect(settle(withGeminiRetry(call))).rejects.toBe(badKey);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('does not spend more quota retrying an exhausted quota', async () => {
    const quota = apiError(429, 'You exceeded your current quota');
    const call = vi.fn().mockRejectedValue(quota);

    await expect(settle(withGeminiRetry(call))).rejects.toBe(quota);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('gives up on the deadline instead of retrying into a two-minute wait', async () => {
    // The failure this exists for: an overloaded Gemini took ~30s to
    // return each 503, so three attempts stacked to 94s and one request
    // ran past 120s. Failing honestly at the deadline beats that.
    const call = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      throw apiError(503, 'The model is overloaded.');
    });

    const error = await settle(withGeminiRetry(call)).catch((e: unknown) => e);

    expect((error as Error).name).toBe('GeminiDeadlineError');
    // Stopped early rather than using every attempt.
    expect(call.mock.calls.length).toBeLessThan(3);
  });

  it('logs latency, resolved model, and the token triple on success', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const call = vi.fn().mockResolvedValue({
      modelVersion: 'gemini-3.7-flash',
      usageMetadata: { promptTokenCount: 2500, candidatesTokenCount: 90, thoughtsTokenCount: 311, totalTokenCount: 2901 },
    });

    await settle(withGeminiRetry(call, 'clara.test'));

    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('clara.test: ok in'),
      expect.objectContaining({
        model: 'gemini-3.7-flash',
        // Thinking tokens bill at the output rate and dominate the cost,
        // so omitting them would understate the bill.
        thinkingTokens: 311,
        promptTokens: 2500,
        outputTokens: 90,
      }),
    );
  });

  it('stays quiet for a result that carries no usage block', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await settle(withGeminiRetry(vi.fn().mockResolvedValue('plain value')));
    expect(info).not.toHaveBeenCalled();
  });

  it('exposes a per-attempt timeout and abort signal for callers to pass through', () => {
    const options = geminiCallOptions(1234);
    expect(options.timeout).toBe(1234);
    expect(options.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('backs off exponentially rather than hammering an overloaded model', async () => {
    const delays: number[] = [];
    const setTimeoutSpy = vi
      .spyOn(globalThis, 'setTimeout')
      // @ts-expect-error — partial timer stub is fine for recording delays
      .mockImplementation((fn: () => void, ms?: number) => {
        delays.push(ms ?? 0);
        fn();
        return 0;
      });

    const call = vi.fn().mockRejectedValue(apiError(503));
    await expect(withGeminiRetry(call)).rejects.toBeDefined();

    expect(delays).toEqual([400, 800]);
    setTimeoutSpy.mockRestore();
  });
});

describe('withGeminiFallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function settle<T>(promise: Promise<T>): Promise<T> {
    const tracked = promise.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    await vi.runAllTimersAsync();
    const result = await tracked;
    if (result.ok) return result.value;
    throw result.error;
  }

  it('uses the first model without ever calling the second when it succeeds', async () => {
    const factory = vi.fn().mockResolvedValue('from primary');
    const result = await settle(withGeminiFallback(['primary', 'secondary'], factory));

    expect(result).toBe('from primary');
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith('primary');
  });

  it('falls back to the next model after ONE attempt — the live-measured case', async () => {
    // The exact scenario this exists for: gemini-flash-latest 503s
    // solid, gemini-3.1-flash-lite answers immediately on the same key.
    // Primary gets a single try, not its usual 3 — retrying a saturated
    // model 3 times would burn the deadline before fallback ever ran,
    // which is exactly what happened in production before this existed.
    const factory = vi.fn().mockImplementation((model: string) =>
      model === 'primary' ? Promise.reject(apiError(503, 'The model is overloaded.')) : Promise.resolve('from secondary'),
    );

    const result = await settle(withGeminiFallback(['primary', 'secondary'], factory));

    expect(result).toBe('from secondary');
    expect(factory.mock.calls.filter(([m]) => m === 'primary')).toHaveLength(1);
    expect(factory.mock.calls.filter(([m]) => m === 'secondary')).toHaveLength(1);
  });

  it('gives the LAST candidate the full retry budget, since it has nowhere left to fall back to', async () => {
    const factory = vi
      .fn()
      .mockRejectedValueOnce(apiError(503, 'overloaded'))
      .mockRejectedValueOnce(apiError(503, 'overloaded'))
      .mockResolvedValue('third attempt on the last model');

    const result = await settle(withGeminiFallback(['only'], factory));

    expect(result).toBe('third attempt on the last model');
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it('falls back immediately on a 404 without spending the first model\'s retries', async () => {
    const notFound = apiError(404, 'This model models/primary is no longer available.');
    const factory = vi.fn().mockImplementation((model: string) =>
      model === 'primary' ? Promise.reject(notFound) : Promise.resolve('from secondary'),
    );

    const result = await settle(withGeminiFallback(['primary', 'secondary'], factory));

    expect(result).toBe('from secondary');
    // A same-model retry can't fix a name that doesn't exist.
    expect(factory.mock.calls.filter(([m]) => m === 'primary')).toHaveLength(1);
  });

  it('does not fall back on a non-retryable, non-404 error — every model would reject it identically', async () => {
    const badKey = apiError(401, 'API key not valid');
    const factory = vi.fn().mockRejectedValue(badKey);

    await expect(settle(withGeminiFallback(['primary', 'secondary'], factory))).rejects.toBe(badKey);
    expect(factory.mock.calls.filter(([m]) => m === 'secondary')).toHaveLength(0);
  });

  it('does not fall back on quota exhaustion — every model on the project shares the same quota', async () => {
    const quota = apiError(429, 'You exceeded your current quota');
    const factory = vi.fn().mockRejectedValue(quota);

    await expect(settle(withGeminiFallback(['primary', 'secondary'], factory))).rejects.toBe(quota);
    expect(factory.mock.calls.filter(([m]) => m === 'secondary')).toHaveLength(0);
  });

  it('stops the whole list on a deadline rather than grinding through remaining candidates with no time left', async () => {
    // Three candidates that each hang for 30s: the first two burn one
    // attempt each (60s) before the third — which would get the full
    // retry budget as the last candidate — is refused outright because
    // the 45s deadline is already gone.
    const call = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      throw apiError(503, 'The model is overloaded.');
    });

    const error = await settle(withGeminiFallback(['primary', 'secondary', 'tertiary'], call)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GeminiDeadlineError);
    expect(call.mock.calls.filter(([m]) => m === 'tertiary')).toHaveLength(0);
  });

  it('rejects an empty candidate list rather than silently doing nothing', async () => {
    await expect(withGeminiFallback([], vi.fn())).rejects.toThrow(/at least one model/);
  });
});
