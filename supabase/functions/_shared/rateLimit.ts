/**
 * Shared, persistent (DB-backed) rate limiter for public Edge Functions.
 *
 * Unlike an in-memory `Map` counter (reset on every cold start, not shared
 * across concurrent isolates/regions), this reads/writes
 * "public"."rate_limit_attempts" via the service role, so the limit holds
 * even across isolate restarts and concurrent invocations.
 *
 * Usage:
 *   const supabase = createClient(supabaseUrl, serviceRoleKey);
 *   const result = await checkRateLimit(supabase, {
 *     bucket: "get-campaign-form",
 *     identifier: getClientIp(req),
 *     maxAttempts: 30,
 *     windowMinutes: 60,
 *   });
 *   if (!result.allowed) {
 *     return rateLimitResponse(result, corsHeaders);
 *   }
 *   // ... handle request ...
 *   await recordRateLimitAttempt(supabase, "get-campaign-form", identifier);
 */

import { withRetryResult } from "./retry.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClientLike = any;

export interface RateLimitOptions {
  /** Identifies the caller/function + rule, e.g. "get-campaign-form". */
  bucket: string;
  /** What is being limited: IP address, email, phone, api key, etc. */
  identifier: string;
  /** Max attempts allowed within the window. */
  maxAttempts: number;
  /** Sliding window size, in minutes. */
  windowMinutes: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Extracts the caller's IP from standard proxy headers. Falls back to
 * "unknown" (still rate-limited as a shared bucket) when absent, matching
 * the existing pattern used by portal-login and the in-memory limiters.
 */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/**
 * Checks whether `identifier` is currently within its allowed attempt count
 * for `bucket`, based on rows recorded in "public"."rate_limit_attempts"
 * within the last `windowMinutes`. Fails OPEN on lookup errors (does not
 * block legitimate traffic if the rate-limit table itself is unreachable),
 * mirroring the fail-open behavior already used by portal-login.
 *
 * This only checks the count — call `recordRateLimitAttempt` separately
 * after a request is accepted for processing, so blocked requests do not
 * also count as new attempts against themselves.
 */
export async function checkRateLimit(
  supabase: SupabaseClientLike,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const { bucket, identifier, maxAttempts, windowMinutes } = options;
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const { data: recent, error } = await withRetryResult(() =>
    supabase
      .from("rate_limit_attempts")
      .select("created_at")
      .eq("bucket", bucket)
      .eq("identifier", identifier)
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(maxAttempts),
  );

  if (error) {
    console.error(`[rateLimit] lookup error (bucket=${bucket}):`, error.message);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const count = recent?.length ?? 0;
  if (count < maxAttempts) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const oldestOfWindow = recent![recent!.length - 1].created_at;
  const lockedUntilMs = new Date(oldestOfWindow).getTime() + windowMinutes * 60 * 1000;
  const retryAfterSeconds = Math.max(0, Math.ceil((lockedUntilMs - Date.now()) / 1000));

  return { allowed: retryAfterSeconds <= 0, retryAfterSeconds };
}

/**
 * Records one attempt against `bucket`/`identifier`. Call this once a
 * request has been accepted (i.e. after `checkRateLimit` allowed it), so
 * the window advances correctly. Errors are logged, not thrown — a failed
 * write should not break the caller's actual response.
 */
export async function recordRateLimitAttempt(
  supabase: SupabaseClientLike,
  bucket: string,
  identifier: string,
): Promise<void> {
  const { error } = await withRetryResult(() =>
    supabase.from("rate_limit_attempts").insert({ bucket, identifier }),
  );
  if (error) {
    console.error(`[rateLimit] failed to record attempt (bucket=${bucket}):`, error.message);
  }
}

/**
 * Convenience helper to build the standard 429 response for a blocked
 * request. Callers still own their own CORS headers.
 */
export function rateLimitResponse(
  result: RateLimitResult,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      error: "rate_limited",
      message: `Demasiados pedidos. Tente novamente dentro de ${Math.ceil(result.retryAfterSeconds / 60)} minuto(s).`,
      retry_after_seconds: result.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSeconds),
      },
    },
  );
}
