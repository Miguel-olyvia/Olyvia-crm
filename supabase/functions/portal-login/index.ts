import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";

import { PRODUCTION_ORIGIN, VERCEL_PREVIEW_ORIGIN_PATTERN } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { withRetry, withRetryResult } from "../_shared/retry.ts";

/**
 * This is the app's single shared login endpoint (used by internal staff and
 * portal clients alike), so unlike other Edge Functions it cannot rely solely
 * on the ALLOWED_ORIGIN env var — that var gets pointed at a test origin
 * (e.g. http://localhost:8080) during local E2E runs, and a fixed single
 * value would then block real production logins via CORS. Instead, accept
 * whichever of [PRODUCTION_ORIGIN, ALLOWED_ORIGIN] matches the request's
 * actual Origin header, falling back to PRODUCTION_ORIGIN otherwise.
 *
 * A request Origin of `http://localhost:<port>` or `http://127.0.0.1:<port>`
 * is also reflected back, regardless of what SUPABASE_URL/ALLOWED_ORIGIN are
 * set to. This is deliberately independent of `_shared/cors.ts`'s
 * `isLocalDev()` check: this function's Edge Function always talks to the
 * real hosted Supabase project (SUPABASE_URL never contains "localhost"),
 * even when the *frontend* calling it is running locally (e.g. `vite dev` on
 * http://localhost:8080/5173) — so what matters here is the caller's Origin
 * header, not where Supabase itself is hosted. The pattern is anchored
 * (`^...$`) and only matches the localhost/127.0.0.1 loopback hosts with an
 * optional port, so it can never reflect an arbitrary third-party origin.
 */
const LOCAL_DEV_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function buildCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const testOrigin = Deno.env.get("ALLOWED_ORIGIN");
  const allowed = [PRODUCTION_ORIGIN, testOrigin].filter(
    (origin): origin is string => Boolean(origin),
  );
  const matched = requestOrigin &&
      (allowed.includes(requestOrigin) ||
        VERCEL_PREVIEW_ORIGIN_PATTERN.test(requestOrigin) ||
        LOCAL_DEV_ORIGIN_PATTERN.test(requestOrigin))
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
    // Transient connection failures are retried with backoff; a lookup
    // failure otherwise falls through to `lookupError` below exactly as
    // before (fails open on the rate-limit check, not on the login itself).
    const { data: recentFailures, error: lookupError } = await withRetryResult(() =>
      supabase
        .from("auth_login_attempts")
        .select("created_at")
        .eq("identifier", identifier)
        .eq("success", false)
        .gte("created_at", windowStart)
        .order("created_at", { ascending: false })
        .limit(MAX_ATTEMPTS)
    );

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
    // Raw `fetch` throws only on real network failures (connection reset,
    // DNS, timeout) — those are safe to retry. It does NOT throw on HTTP
    // error responses (e.g. 401 for wrong credentials), so a retryable
    // upstream outage (502/503/504) is detected explicitly below and
    // re-thrown as an error `withRetry` recognizes; wrong-credentials
    // responses (401/400) fall through untouched and are never retried.
    const tokenRes = await withRetry(async () => {
      const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
        },
        body: JSON.stringify({ email: identifier, password }),
      });

      if (res.status === 502 || res.status === 503 || res.status === 504) {
        const transientError = new Error(`GoTrue token endpoint returned ${res.status}`);
        (transientError as Error & { status?: number }).status = res.status;
        throw transientError;
      }

      return res;
    });

    const tokenBody = await tokenRes.json().catch(() => ({}));
    const success = tokenRes.ok && typeof tokenBody.access_token === "string" && typeof tokenBody.refresh_token === "string";

    // On success, GoTrue's password-grant response includes the authenticated
    // user's id directly — no extra lookup needed. On failure we deliberately
    // do NOT look up the user by email here (see note above the insert): the
    // only lookup available in this codebase, auth.admin.listUsers(), is an
    // unbounded paginated scan with no email filter, so it would add
    // attacker-observable, email-dependent latency to this exact endpoint.
    const authUserId: string | null = success && typeof tokenBody.user?.id === "string"
      ? tokenBody.user.id
      : null;

    // 3. Record the outcome. Awaited so lockout state is consistent for the
    // very next request even if it arrives immediately after this one.
    // Transient connection failures are retried with backoff.
    // `attemptTimestamp` is set explicitly (rather than left to the column's
    // default) so the new-device check below can unambiguously exclude the
    // row being inserted here by filtering on `created_at < attemptTimestamp`.
    const attemptTimestamp = new Date().toISOString();
    const { error: insertError } = await withRetryResult(() =>
      supabase.from("auth_login_attempts").insert({
        identifier,
        success,
        ip_address: clientIp,
        user_agent: userAgent,
        auth_user_id: authUserId,
        created_at: attemptTimestamp,
      })
    );
    if (insertError) {
      console.error("[portal-login] failed to record attempt:", insertError.message);
    }

    // 3a. RGPD Art. 32 audit trail (part 3): alert the user when a successful
    // login comes from an IP/device combination they've never used before.
    // This is a purely informational side-effect — any failure here (lookup
    // or notification insert) is logged and swallowed so it can never affect
    // the login response itself.
    if (success && authUserId) {
      try {
        // NOTE: ip_address/user_agent are attacker-controlled request headers
        // and frequently contain commas/parentheses (e.g. standard User-Agent
        // strings), which would corrupt PostgREST's `.or("col.eq.value,...")`
        // filter syntax if interpolated directly. So the ip/user-agent match
        // is done in application code below instead of in the query filter.
        const { data: priorSuccesses, error: deviceLookupError } = await withRetryResult(() =>
          supabase
            .from("auth_login_attempts")
            .select("ip_address, user_agent")
            .eq("auth_user_id", authUserId)
            .eq("success", true)
            .lt("created_at", attemptTimestamp)
            .order("created_at", { ascending: false })
            .limit(200)
        );

        if (deviceLookupError) {
          console.error("[portal-login] device-history lookup error:", deviceLookupError.message);
        } else {
          const isKnownDevice = (priorSuccesses || []).some((row) =>
            row.ip_address === clientIp && row.user_agent === userAgent
          );

          if (!isKnownDevice) {
            const { error: notifyError } = await supabase.from("notifications").insert({
              user_id: authUserId,
              type: "new_device_login",
              kind: "alert",
              priority: "high",
              title: "Novo acesso detetado",
              message: "Detetámos um novo acesso à sua conta a partir de um endereço IP ou dispositivo que não reconhecemos. Se foi você, pode ignorar esta mensagem.",
              data: { ip_address: clientIp, user_agent: userAgent },
            });
            if (notifyError) {
              console.error("[portal-login] failed to create new-device notification:", notifyError.message);
            }
          }
        }
      } catch (deviceCheckErr) {
        console.error("[portal-login] new-device check failed unexpectedly:", deviceCheckErr);
      }
    }

    // 3b. Enforce the lockout at the GoTrue level itself, not just in this
    // function. Without this, the lockout above only ever gated portal-login
    // — GoTrue's own password-grant endpoint has no CORS restriction and
    // accepts the same public anon key from any origin, so an attacker who
    // calls it directly (skipping portal-login entirely) would bypass the
    // lockout completely. Banning the account via the admin API makes GoTrue
    // itself reject the login on every endpoint/origin until the ban expires.
    if (!success) {
      const failureCountIncludingThisOne = (recentFailures?.length || 0) + 1;
      if (failureCountIncludingThisOne >= MAX_ATTEMPTS) {
        const { data: userIdToBan, error: lookupUserError } = await withRetryResult(() =>
          supabase.rpc("get_auth_user_id_by_email", { p_email: identifier })
        );
        if (lookupUserError) {
          console.error("[portal-login] failed to resolve user for ban:", lookupUserError.message);
        } else if (userIdToBan) {
          const { error: banError } = await supabase.auth.admin.updateUserById(userIdToBan, {
            ban_duration: `${LOCKOUT_MINUTES}m`,
          });
          if (banError) {
            console.error("[portal-login] failed to apply lockout ban:", banError.message);
          }
        }
      }
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
