import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";

const requestSchema = z.object({
  targetUserId: z.string(),
  newPassword: z.string().optional(),
  newEmail: z.string().email().optional(),
}).refine(data => data.newPassword || data.newEmail, {
  message: "newPassword or newEmail is required",
});

import { getCorsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { possoGerirUtilizador, souAdminSistema, temPermissao } from "../_shared/adminConta.ts";

initSentry();

function handleUpdateError(error: any) {
  const msg = error.message.toLowerCase();
  if (msg.includes("same") || msg.includes("identical") || msg.includes("different")) {
    return { error: "A nova password não pode ser igual à password atual", status: 400 };
  }
  if (msg.includes("email") && msg.includes("already")) {
    return { error: "Este email já está em uso por outro utilizador", status: 400 };
  }
  return { error: error.message, status: 400 };
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller identity
    const supabaseUser = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callingUser }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !callingUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request", details: parsed.error.issues }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { targetUserId, newPassword, newEmail } = parsed.data;

    if (newPassword && newPassword.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (newEmail && !newEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return new Response(JSON.stringify({ error: "Invalid email format" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Build update object
    const updateObj: { password?: string; email?: string } = {};
    if (newPassword) updateObj.password = newPassword;
    if (newEmail) updateObj.email = newEmail;

    // Self-update is always allowed
    if (targetUserId === callingUser.id) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, updateObj);
      if (error) {
        const r = handleUpdateError(error);
        return new Response(JSON.stringify({ error: r.error }), {
          status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin check via anew_memberships + anew_roles
    const { data: callerAnew } = await supabaseAdmin
      .from("anew_users")
      .select("id")
      .eq("auth_user_id", callingUser.id)
      .maybeSingle();

    if (!callerAnew) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Autorização (20270106300000): já não se decide pelo CÓDIGO do papel
    // (system_admin/super_admin/org_admin) — um administrador de organização
    // podia criar um papel com um desses códigos e dá-lo a quem quisesse. Conta o
    // administrador de sistema verdadeiro ou as permissões da ação: mudar a
    // palavra-passe pede users.change_password, mudar o email pede users.edit
    // (o papel base "Admin" e o super_admin têm as duas).
    const isSystemAdmin = await souAdminSistema(supabaseAdmin, callingUser.id);
    const isAdminUser = isSystemAdmin || (
      (!newPassword || await temPermissao(supabaseAdmin, callingUser.id, "users.change_password")) &&
      (!newEmail || await temPermissao(supabaseAdmin, callingUser.id, "users.edit"))
    );

    if (!isAdminUser) {
      return new Response(JSON.stringify({ error: "Not authorized to update user" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only system_admin has global bypass — super_admin goes through scope check
    if (isSystemAdmin) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, updateObj);
      if (error) {
        const r = handleUpdateError(error);
        return new Response(JSON.stringify({ error: r.error }), {
          status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Âmbito (20270106340000): só quem pode gerir a conta — a permissão da ação
    // na organização de CADA associação ativa da pessoa (ou acima; os direitos
    // de administração descem, não sobem), nunca um administrador de sistema,
    // nunca alguém com um papel com mais poder. Antes bastava a pessoa estar
    // numa organização visível (que inclui as de cima): o administrador de uma
    // filha mudava a palavra-passe do dono da mãe.
    const { data: targetAnew } = await supabaseAdmin
      .from("anew_users")
      .select("id")
      .eq("auth_user_id", targetUserId)
      .maybeSingle();

    if (!targetAnew) {
      return new Response(JSON.stringify({ error: "Target user not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const podeGerir =
      (!newPassword || await possoGerirUtilizador(supabaseAdmin, callingUser.id, targetAnew.id, "users.change_password")) &&
      (!newEmail || await possoGerirUtilizador(supabaseAdmin, callingUser.id, targetAnew.id, "users.edit"));

    if (!podeGerir) {
      return new Response(JSON.stringify({ error: "Target user not in your organizational scope" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Perform the update
    const { error } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, updateObj);
    if (error) {
      const r = handleUpdateError(error);
      return new Response(JSON.stringify({ error: r.error }), {
        status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in update-user-password:", error);
    await captureError(error, { function: "update-user-password" });
    // Unlike handleUpdateError's curated GoTrue messages above, an exception
    // reaching this catch-all is unexpected (e.g. a raw network/Postgres
    // failure) and must not be echoed back verbatim to the client.
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
