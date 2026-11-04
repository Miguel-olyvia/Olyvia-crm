import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";

const requestSchema = z.object({
  userId: z.string(),
});

import { getCorsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { possoGerirUtilizador, souAdminSistema, temPermissao } from "../_shared/adminConta.ts";

initSentry();

// Restores login access for a previously deactivated user (the inverse of
// delete-user's ban). See supabase/migrations/20261107090000_rpc_delete_user_soft_delete_and_restore.sql
// for the full soft-deactivation design. Authorization mirrors delete-user
// exactly (same admin-role check, same scope check) since restoring is the
// direct inverse of deactivating and is reachable only from the same admin
// surface (src/pages/UsersNew.tsx, gated behind users.delete + ownership
// checks — see rpc_restore_user's permission-choice note for why no separate
// users.restore permission was introduced).
serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Admin check via anew_memberships + anew_roles (same as delete-user)
    const { data: callerAnew } = await supabaseClient
      .from("anew_users")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!callerAnew) {
      return new Response(
        JSON.stringify({ error: "User not found in system" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Autorização (20270106300000): já não se decide pelo CÓDIGO do papel
    // (system_admin/super_admin/org_admin) — um administrador de organização
    // podia criar um papel com um desses códigos e dá-lo a quem quisesse. Conta o
    // administrador de sistema verdadeiro ou a permissão users.delete (o papel
    // base "Admin" e o super_admin têm-na).
    const isSystemAdmin = await souAdminSistema(supabaseClient, user.id);
    const callerIsAdmin = isSystemAdmin || await temPermissao(supabaseClient, user.id, "users.delete");

    if (!callerIsAdmin) {
      return new Response(
        JSON.stringify({ error: "User not allowed" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawBody = await req.json();
    const parsed = requestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { userId } = parsed.data;

    // Âmbito (20270106340000): fora o administrador de sistema, só quem pode
    // gerir a conta — users.delete na organização de CADA associação da pessoa
    // (ou acima; os direitos de administração descem, não sobem), nunca a
    // própria conta, nunca um administrador de sistema, nunca alguém com um
    // papel com mais poder. Antes bastava a pessoa estar numa organização
    // visível (que inclui as de cima) — o administrador de uma filha bania os
    // utilizadores da mãe — e uma conta sem ficha passava sem verificação.
    if (!isSystemAdmin) {
      const { data: targetAnew } = await supabaseClient
        .from("anew_users")
        .select("id")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (!targetAnew || !(await possoGerirUtilizador(supabaseClient, user.id, targetAnew.id, "users.delete", true))) {
        return new Response(
          JSON.stringify({ error: "Target user not in your organizational scope" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Reverse the ban applied by delete-user (ban_duration: 'none' clears
    // banned_until). The matching public.anew_users row is restored by the
    // caller (src/pages/UsersNew.tsx) via rpc_restore_user, which writes the
    // single entity_audit_log row for this action.
    const { error: unbanError } = await supabaseClient.auth.admin.updateUserById(userId, {
      ban_duration: "none",
    });

    if (unbanError) {
      console.error("auth.admin.updateUserById (unban) failed:", unbanError);
      return new Response(
        JSON.stringify({ error: unbanError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "User restored successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    await captureError(error, { function: "restore-user" });
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
