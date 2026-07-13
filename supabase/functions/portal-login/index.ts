import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";

import { PRODUCTION_ORIGIN } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";

/**
 * This is the app's single shared login endpoint (used by internal staff and
 * portal clients alike), so unlike other Edge Functions it cannot rely solely
 * on the ALLOWED_ORIGIN env var — that var gets pointed at a test origin
 * (e.g. http://localhost:8080) during local E2E runs, and a fixed single
 * value would then block real production logins via CORS. Instead, accept
 * whichever of [PRODUCTION_ORIGIN, ALLOWED_ORIGIN] matches the request's
 * actual Origin header, falling back to PRODUCTION_ORIGIN otherwise.
 */
function buildCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const testOrigin = Deno.env.get("ALLOWED_ORIGIN");
  const allowed = [PRODUCTION_ORIGIN, testOrigin].filter(
    (origin): origin is string => Boolean(origin),
  );
  const matched = requestOrigin && allowed.includes(requestOrigin)
    ? requestOrigin
    : PRODUCTION_ORIGIN;

  return {
    "Access-Control-Allow-Origin": matched,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
}

/**
 * Brokers password sign-in for the login page (src/pages/Auth.tsx) so that
 * failed-attempt rate limiting is enforced server-side instead of only in
 * sessionStorage (trivially bypassed by clearing storage or opening a
 * private tab).
 *
 * Flow:
 *   1. Check "public"."auth_login_attempts" for failed attempts by this
 *      identifier (email, lowercased) within the last WINDOW_MINUTES.
 *   2. If at/above MAX_ATTEMPTS, reject with 429 before ever touching GoTrue.
 *   3. Otherwise, perform the password grant directly against GoTrue's REST
 *      endpoint (the anon key is used here exactly as the supabase-js client
 *      SDK would use it for signInWithPassword; no elevated privilege).
 *   4. Record the outcome (success or failure) with the service role, then
 *      return either the session tokens (success) or a generic error
 *      (failure) to the caller.
 *
 * The caller (Auth.tsx) is expected to call supabase.auth.setSession() with
 * the returned tokens on success.
 */

initSentry();

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;
const LOCKOUT_MINUTES = 15;

const requestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "invalid_request", message: "Email e password são obrigatórios." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const identifier = parsed.data.email.trim().toLowerCase();
    const { password } = parsed.data;
    const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

    // 1. Check lockout BEFORE attempting authentication.
    const { data: recentFailures, error: lookupError } = await supabase
      .from("auth_login_attempts")
      .select("created_at")
      .eq("identifier", identifier)
      .eq("success", false)
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(MAX_ATTEMPTS);

    if (lookupError) {
      console.error("[portal-login] lookup error:", lookupError.message);
    }

    if ((recentFailures?.length || 0) >= MAX_ATTEMPTS) {
      const oldestOfWindow = recentFailures![recentFailures!.length - 1].created_at;
      const lockedUntilMs = new Date(oldestOfWindow).getTime() + LOCKOUT_MINUTES * 60 * 1000;
      const retryAfterSeconds = Math.max(0, Math.ceil((lockedUntilMs - Date.now()) / 1000));

      if (retryAfterSeconds > 0) {
        return new Response(JSON.stringify({
          error: "rate_limited",
          message: `Demasiadas tentativas falhadas. Tente novamente dentro de ${Math.ceil(retryAfterSeconds / 60)} minuto(s).`,
          retry_after_seconds: retryAfterSeconds,
        }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 2. Perform the actual authentication against GoTrue's password grant.
    const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
      },
      body: JSON.stringify({ email: identifier, password }),
    });

    const tokenBody = await tokenRes.json().catch(() => ({}));
    const success = tokenRes.ok && typeof tokenBody.access_token === "string" && typeof tokenBody.refresh_token === "string";

    // 3. Record the outcome. Awaited so lockout state is consistent for the
    // very next request even if it arrives immediately after this one.
    const { error: insertError } = await supabase.from("auth_login_attempts").insert({
      identifier,
      success,
      ip_address: clientIp,
      user_agent: userAgent,
    });
    if (insertError) {
      console.error("[portal-login] failed to record attempt:", insertError.message);
    }

    if (!success) {
      return new Response(JSON.stringify({
        error: "invalid_credentials",
        message: "Email ou password incorretos.",
      }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      access_token: tokenBody.access_token,
      refresh_token: tokenBody.refresh_token,
      expires_in: tokenBody.expires_in,
      token_type: tokenBody.token_type,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[portal-login] Error:", err);
    await captureError(err, { function: "portal-login" });
    return new Response(JSON.stringify({ error: "internal_error", message: "Erro interno. Tente novamente." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
