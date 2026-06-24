/**
 * Shared CORS headers for authenticated Edge Functions.
 *
 * In production, set ALLOWED_ORIGIN=https://app.olyvia.pt (or your actual domain).
 * In development (env var absent), falls back to "*" so local Supabase works without config.
 *
 * Public functions (book-slot, create-lead, insert-lead, update-lead,
 * public-availability, get-campaign-form, get-form-data, get-campaign-districts,
 * chat-widget-ai, track-proposal-view, fetch-holidays, api-proxy) define their own
 * corsHeaders with "Access-Control-Allow-Origin": "*" and do NOT import from here.
 */

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

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
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
