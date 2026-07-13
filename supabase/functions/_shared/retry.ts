/**
 * Retry utility for Edge Functions — connection resilience
 *
 * Wraps critical DB/network calls with exponential backoff so that
 * transient failures (failover, pool exhaustion, 502/503/504) are
 * retried transparently instead of surfacing immediately to the caller.
 *
 * Uso (chamadas que lançam exceção, ex.: falha de rede num fetch cru):
 *   const data = await withRetry(() => someThrowingCall())
 *
 * Uso (supabase-js — a maioria das chamadas NÃO lança exceção, devolve
 * sempre `{ data, error }`, mesmo em erro de rede/timeout):
 *   const { data, error } = await withRetryResult(() =>
 *     supabase.from("table").select("*").eq("id", id).maybeSingle()
 *   );
 */

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Initial delay in milliseconds before the first retry. Default: 100 */
  initialDelayMs?: number;
  /** Multiplier applied to delay after each failed attempt. Default: 2 */
  backoffMultiplier?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 100,
  backoffMultiplier: 2,
};

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes `fn` with exponential backoff, retrying only on retryable errors.
 *
 * Retry schedule (defaults): 100ms → 200ms → gives up
 * Non-retryable errors (403, 404, validation, auth) are rethrown immediately.
 * After exhausting all attempts the original error from the last attempt is rethrown.
 *
 * Use this for calls that actually THROW on failure (raw `fetch`, SMTP
 * clients, etc). Most supabase-js calls do NOT throw — use `withRetryResult`
 * for those instead.
 *
 * @param fn       Async factory that produces the operation to attempt.
 * @param options  Optional retry configuration.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const { maxAttempts, initialDelayMs, backoffMultiplier } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  let lastError: unknown;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      // Never retry business/auth/validation errors — only connection failures.
      if (!isRetryableError(error)) {
        throw error;
      }

      // No sleep after the last attempt — just fall through and rethrow.
      if (attempt < maxAttempts) {
        await sleep(delayMs);
        delayMs *= backoffMultiplier;
      }
    }
  }

  throw lastError;
}

/**
 * Executes `fn` with exponential backoff for calls shaped like the
 * supabase-js result envelope (`{ data, error }` — any `.from()`, `.rpc()`,
 * or `auth.admin.*` call). supabase-js swallows network/timeout failures
 * into `error` instead of throwing, so `withRetry` alone would never see
 * them. This wrapper inspects `result.error` on each attempt and retries
 * only when it looks transient (connection reset, timeout, 502/503/504).
 * Business errors (permission denied, unique violation, FK violation,
 * validation) are returned immediately so callers keep their existing
 * `if (error) ...` handling unchanged.
 *
 * @param fn       Async factory that produces the supabase-js call.
 * @param options  Optional retry configuration.
 */
export async function withRetryResult<T extends { error: unknown }>(
  fn: () => PromiseLike<T>,
  options?: RetryOptions
): Promise<T> {
  const { maxAttempts, initialDelayMs, backoffMultiplier } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  let lastResult: T | undefined;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      lastResult = result;

      if (!result.error || !isRetryableError(result.error)) {
        return result;
      }

      if (attempt < maxAttempts) {
        await sleep(delayMs);
        delayMs *= backoffMultiplier;
      }
    } catch (error: unknown) {
      // Defensive: a small number of paths still throw (e.g. raw fetch
      // failures surfacing before supabase-js wraps them).
      if (!isRetryableError(error) || attempt >= maxAttempts) throw error;
      await sleep(delayMs);
      delayMs *= backoffMultiplier;
    }
  }

  return lastResult as T;
}

/**
 * Returns `true` when the error looks like a transient network/connection
 * problem that is safe to retry.
 *
 * Returns `false` for business errors (4xx from Supabase, validation
 * failures, auth rejections) so those are never retried.
 */
export function isRetryableError(error: unknown): boolean {
  // Retryable HTTP status codes from upstream services.
  const retryableStatusCodes = new Set([502, 503, 504]);

  if (error !== null && typeof error === "object") {
    const err = error as Record<string, unknown>;

    // Supabase/fetch error objects sometimes carry a numeric `status` field.
    if (typeof err["status"] === "number") {
      if (retryableStatusCodes.has(err["status"])) return true;
      // Any other explicit HTTP status is a business error — do not retry.
      if (err["status"] >= 400) return false;
    }

    // `code` strings used by Node/Deno networking errors.
    if (typeof err["code"] === "string") {
      const code = err["code"].toUpperCase();
      if (
        code === "ECONNRESET" ||
        code === "ECONNREFUSED" ||
        code === "ETIMEDOUT" ||
        code === "ENOTFOUND" ||
        code === "ENETUNREACH"
      ) {
        return true;
      }
    }
  }

  // Fall back to message-based heuristics for errors that don't carry
  // structured metadata (e.g. raw `fetch failed`, DOMException, etc.).
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  const retryableKeywords = [
    "connection",
    "timeout",
    "econnreset",
    "econnrefused",
    "socket",
    "network",
    "fetch failed",
  ];

  return retryableKeywords.some((keyword) => message.includes(keyword));
}
