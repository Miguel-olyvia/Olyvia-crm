import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";

import { resolveCallerIdentity, authErrorResponse, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { possoGerirUtilizador, souAdminSistema } from "../_shared/adminConta.ts";
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
 * Permission gate: resolve the caller's identity from their own JWT (no
 * service-role bypass for this endpoint). 05/11/2026 (20270109400000 ronda 2):
 * passa o administrador de sistema verdadeiro OU quem pode gerir a conta da
 * pessoa com users.edit — a regra do Lote D (fn_pode_gerir_utilizador_por):
 * permissão na organização de CADA associação ativa da pessoa (ou acima),
 * nunca a própria, nunca um administrador de sistema, nunca alguém com um
 * papel com mais poder. Tudo decidido na base; o cliente nunca afirma nada.
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
    // ── 3. Autorização: admin de sistema, ou users.edit sobre esta pessoa ──
    // O admin de sistema mantém o alcance total (também contas sem ficha em
    // anew_users). Os outros só sobre uma pessoa que conseguem gerir.
    const isSystemAdmin = await souAdminSistema(supabase, caller.authUid);
    if (!isSystemAdmin) {
      const { data: targetAnew, error: targetError } = await supabase
        .from("anew_users")
        .select("id")
        .eq("auth_user_id", target_auth_user_id)
        .maybeSingle();
      if (targetError) {
        console.error("[revoke-user-sessions] anew_users lookup error:", targetError);
        throw new AuthError("Failed to resolve target user", 500);
      }
      const podeGerir = !!targetAnew &&
        await possoGerirUtilizador(supabase, caller.authUid, targetAnew.id, "users.edit");
      if (!podeGerir) {
        throw new AuthError("Sem permissão para terminar as sessões desta pessoa", 403);
      }
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
