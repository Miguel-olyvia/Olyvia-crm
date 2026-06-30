/**
 * Shared CORS headers for authenticated Edge Functions.
 *
 * In production, set ALLOWED_ORIGIN=https://app.olyvia.pt (or your actual domain).
 *
 * SECURITY: The wildcard "*" MUST NOT be used as a fallback in production because
 * authenticated functions (e.g. export-data) expose personal data. Any browser from
 * any domain could call these functions cross-origin if the origin is unrestricted.
 *
 * Resolution order:
 *   1. ALLOWED_ORIGIN env var is set → use that value (covers both dev and prod).
 *   2. SUPABASE_URL contains "localhost" or "127.0.0.1" → local dev, allow "*".
 *   3. Otherwise (production runtime without ALLOWED_ORIGIN) → use the known
 *      production origin as a safe fallback instead of falling back to "*".
 *
 * Public functions (book-slot, create-lead, insert-lead, update-lead,
 * public-availability, get-campaign-form, get-form-data, get-campaign-districts,
 * chat-widget-ai, track-proposal-view, fetch-holidays, api-proxy) define their own
 * corsHeaders with "Access-Control-Allow-Origin": "*" and do NOT import from here.
 */

const PRODUCTION_ORIGIN = "https://app.olyvia.pt";

function resolveAllowedOrigin(): string {
  const explicit = Deno.env.get("ALLOWED_ORIGIN");
  if (explicit) return explicit;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const isLocalDev =
    supabaseUrl.includes("localhost") || supabaseUrl.includes("127.0.0.1");
  if (isLocalDev) return "*";

  // Production runtime without ALLOWED_ORIGIN set: use the known safe origin
  // rather than allowing all origins. Set ALLOWED_ORIGIN explicitly if this
  // needs to change (e.g. staging domain, preview URLs).
  return PRODUCTION_ORIGIN;
}

const allowedOrigin = resolveAllowedOrigin();

/**
 * Base CORS headers for authenticated functions.
 * Covers the standard Supabase client headers.
 * Functions that need additional headers (x-api-key, supabase platform headers, etc.)
 * should spread this and add the extra entries.
 */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Extended CORS headers for functions that also need Supabase platform/runtime
 * client info headers (e.g. send-email, trigger-email-template, send-schedule-invite).
 */
export const corsHeadersExtended: Record<string, string> = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
