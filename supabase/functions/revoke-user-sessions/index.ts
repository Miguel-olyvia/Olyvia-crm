import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";

import { resolveCallerIdentity, authErrorResponse, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";

/**
 * RGPD Art. 32 auth-audit-trail feature, part 2: lets a system admin force
 * every active session of a given auth user to re-authenticate (e.g. after a
 * suspected credential compromise surfaced via the login-attempts audit
 * log). This has to be a service-role Admin API call
 * (supabase.auth.admin.signOut(user_id, 'global')) — GoTrue's Admin API is
 * an HTTP call, not a Postgres operation, so it cannot be a SQL RPC like
 * get_login_attempts_audit_log (20261110190000_auth_audit_log_rpc.sql).
 *
 * Permission gate follows the same shape as request-support-access: resolve
 * the caller's identity from their own JWT (no service-role bypass for this
 * endpoint), then verify system_admin via the canonical get_user_context RPC
 * — never trust a client-supplied admin flag.
 */

initSentry();

const requestSchema = z.object({
  target_auth_user_id: z.string().uuid(),
});

serve(async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 1. Auth: JWT required, no service-role bypass ──────────────────────
  // This endpoint is invoked by a logged-in system admin from the frontend,
  // never function-to-function, so a raw SERVICE_ROLE bearer token is
  // rejected the same way request-support-access rejects it.
  let caller;
  try {
    caller = await resolveCallerIdentity(req, supabase);
  } catch (e) {
    return authErrorResponse(e, corsHeaders);
  }

  if (caller.isServiceRole) {
    return new Response(
      JSON.stringify({ error: "User JWT required to revoke sessions" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── 2. Zod parse before any I/O ─────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { target_auth_user_id } = parsed.data;

  try {
    // ── 3. Verify caller is system_admin via get_user_context RPC ────────
    // Same canonical gate as request-support-access and
    // get_login_attempts_audit_log: resolve the caller's own auth.uid()
    // server-side and check public.is_system_admin(uid) — the client never
    // gets to assert its own admin status.
    const { data: ctx, error: ctxError } = await supabase.rpc("get_user_context", {
      _auth_user_id: caller.authUid,
    });

    if (ctxError) {
      console.error("[revoke-user-sessions] get_user_context error:", ctxError);
      throw new AuthError("Failed to resolve user context", 500);
    }

    if (!ctx?.is_system_admin) {
      throw new AuthError("Only system admins can revoke user sessions", 403);
    }

    // ── 4. Revoke every active session for the target user ───────────────
    // Global sign-out invalidates all refresh tokens for target_auth_user_id,
    // forcing re-authentication on every device/session.
    const { error: signOutError } = await supabase.auth.admin.signOut(
      target_auth_user_id,
      "global",
    );

    if (signOutError) {
      console.error("[revoke-user-sessions] signOut error:", signOutError);
      return new Response(
        JSON.stringify({ error: signOutError.message || "Failed to revoke sessions" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return authErrorResponse(error, corsHeaders);
    }
    console.error("[revoke-user-sessions] Error:", error);
    await captureError(error, { function: "revoke-user-sessions" });
    // Unexpected exception (not the curated AuthError/signOutError cases
    // above) — never echo raw internal error text to the client.
    return new Response(JSON.stringify({ error: "unexpected_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
