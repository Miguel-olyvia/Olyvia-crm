/**
 * Shared CORS headers for authenticated Edge Functions.
 *
 * In production, set ALLOWED_ORIGIN=https://app.olyvia.pt (or your actual domain).
 *
 * SECURITY: The wildcard "*" MUST NOT be used as a fallback in production because
 * authenticated functions (e.g. export-data) expose personal data. Any browser from
 * any domain could call these functions cross-origin if the origin is unrestricted.
 * The allowed origin is resolved dynamically per-request (based on the request's
 * own Origin header) rather than computed once at module load, so that Vercel
 * preview deployments (which get a unique origin per branch) can be allow-listed
 * via a strict, anchored pattern without ever reflecting an arbitrary origin.
 *
 * Resolution order (per request):
 *   1. SUPABASE_URL contains "localhost" or "127.0.0.1" → local dev (local
 *      Supabase stack), allow "*".
 *   2. Otherwise, the request's Origin header is allowed (reflected back) only if
 *      it exactly matches the production origin, exactly matches the ALLOWED_ORIGIN
 *      env var (if set), matches the anchored Vercel preview URL pattern for
 *      this project, or matches the anchored local-dev loopback pattern
 *      (`http(s)://localhost` / `http(s)://127.0.0.1`, optional port). This last
 *      case covers a frontend running locally (e.g. `vite dev` on
 *      http://localhost:5173) while calling the real, hosted Supabase project —
 *      SUPABASE_URL never contains "localhost" in that case, so check #1 alone
 *      would miss it and every OPTIONS preflight from local dev would be
 *      rejected by the browser (Access-Control-Allow-Origin mismatch), exactly
 *      like the bug fixed in portal-login/index.ts. The pattern is anchored
 *      (`^...$`) so it can never reflect an arbitrary third-party origin.
 *   3. Otherwise, fall back to the known production origin (never reflect an
 *      unrecognized origin, never fall back to "*" outside local dev).
 *
 * Public functions (book-slot, create-lead, insert-lead, update-lead,
 * public-availability, get-campaign-form, get-form-data, get-campaign-districts,
 * chat-widget-ai, track-proposal-view, fetch-holidays, api-proxy) define their own
 * corsHeaders with "Access-Control-Allow-Origin": "*" and do NOT import from here.
 */

// The app is served from olyvia-ai.com; app.olyvia.pt is the older domain and
// is kept so anything still pointing there keeps working. A request whose
// Origin matches any of these is reflected back; anything else falls back to
// PRODUCTION_ORIGIN and is therefore rejected by the browser.
export const PRODUCTION_ORIGIN = "https://www.olyvia-ai.com";

export const ADDITIONAL_ALLOWED_ORIGINS = [
  "https://olyvia-ai.com",
  "https://app.olyvia.pt",
];

// Anchored: matches only this project's own Vercel preview URLs, e.g.
// https://olyvia-crm-git-development-miguel-bmgest.vercel.app
// Anchoring with ^/$ prevents bypasses like
// https://olyvia-crm-git-x-bmgest.vercel.app.evil.com
export const VERCEL_PREVIEW_ORIGIN_PATTERN =
  /^https:\/\/olyvia-crm-git-[a-z0-9-]+-bmgest\.vercel\.app$/;

// Anchored: matches only the localhost/127.0.0.1 loopback hosts with an
// optional port (e.g. http://localhost:5173, http://127.0.0.1:4173), never an
// arbitrary origin that merely contains "localhost" (e.g.
// https://localhost.evil.com or https://evil-localhost.com are rejected).
export const LOCAL_DEV_ORIGIN_PATTERN =
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function isLocalDev(): boolean {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  return (
    supabaseUrl.includes("localhost") || supabaseUrl.includes("127.0.0.1")
  );
}

function resolveAllowedOrigin(req: Request): {
  origin: string;
  isDynamic: boolean;
} {
  if (isLocalDev()) {
    return { origin: "*", isDynamic: false };
  }

  const requestOrigin = req.headers.get("origin");
  const explicitAllowedOrigin = Deno.env.get("ALLOWED_ORIGIN");

  const isAllowed =
    requestOrigin !== null &&
    (requestOrigin === PRODUCTION_ORIGIN ||
      ADDITIONAL_ALLOWED_ORIGINS.includes(requestOrigin) ||
      requestOrigin === explicitAllowedOrigin ||
      VERCEL_PREVIEW_ORIGIN_PATTERN.test(requestOrigin) ||
      LOCAL_DEV_ORIGIN_PATTERN.test(requestOrigin));

  if (isAllowed) {
    return { origin: requestOrigin, isDynamic: true };
  }

  // Unrecognized or missing origin: fall back to the known safe origin
  // rather than allowing all origins or reflecting the caller's origin.
  return { origin: PRODUCTION_ORIGIN, isDynamic: true };
}

/**
 * Base CORS headers for authenticated functions.
 * Covers the standard Supabase client headers.
 * Functions that need additional headers (x-api-key, supabase platform headers, etc.)
 * should spread this and add the extra entries.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const { origin, isDynamic } = resolveAllowedOrigin(req);

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    ...(isDynamic ? { Vary: "Origin" } : {}),
  };
}

/**
 * Extended CORS headers for functions that also need Supabase platform/runtime
 * client info headers (e.g. send-email, trigger-email-template, send-schedule-invite).
 */
export function getCorsHeadersExtended(req: Request): Record<string, string> {
  const { origin, isDynamic } = resolveAllowedOrigin(req);

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    ...(isDynamic ? { Vary: "Origin" } : {}),
  };
}
