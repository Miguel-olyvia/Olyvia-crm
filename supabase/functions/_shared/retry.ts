/**
 * Retry utility for Edge Functions — connection resilience
 *
 * Wraps critical DB/network calls with exponential backoff so that
 * transient failures (failover, pool exhaustion, 502/503/504) are
 * retried transparently instead of surfacing immediately to the caller.
 *
 * Uso: wraps queries críticas
 * const data = await withRetry(() => supabase.from("table").select("*"))
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

/**
 * Executes `fn` with exponential backoff, retrying only on retryable errors.
 *
 * Retry schedule (defaults): 100ms → 200ms → gives up
 * Non-retryable errors (403, 404, validation, auth) are rethrown immediately.
 * After exhausting all attempts the original error from the last attempt is rethrown.
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
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        delayMs *= backoffMultiplier;
      }
    }
  }

  throw lastError;
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
