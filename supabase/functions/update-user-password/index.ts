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

import { corsHeaders } from "../_shared/cors.ts";

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

    const { data: callerMemberships } = await supabaseAdmin
      .from("anew_memberships")
      .select("organization_id, role_id")
      .eq("user_id", callerAnew.id)
      .eq("status", "active");

    

    // Resolve role codes from role_ids
    const roleIds = [...new Set((callerMemberships || []).map((m: any) => m.role_id).filter(Boolean))];
    let callerRoles: string[] = [];
    if (roleIds.length > 0) {
      const { data: roles } = await supabaseAdmin
        .from("anew_roles")
        .select("id, code")
        .in("id", roleIds);
      callerRoles = (roles || []).map((r: any) => r.code).filter(Boolean);
    }
    

    const isSystemAdmin = callerRoles.includes("system_admin");
    const isAdminUser = callerRoles.some(r => ["system_admin", "super_admin", "org_admin"].includes(r));

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

    // Scope check: target user must be in caller's visible org tree
    const { data: visibleOrgs } = await supabaseAdmin.rpc("get_user_visible_org_ids", {
      _auth_uid: callingUser.id,
    });

    const visibleOrgIds = (visibleOrgs || []).map((r: any) => r.organization_id || r);

    // Get target user's org memberships
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

    const { data: targetMemberships } = await supabaseAdmin
      .from("anew_memberships")
      .select("organization_id")
      .eq("user_id", targetAnew.id)
      .eq("status", "active");

    const targetOrgIds = (targetMemberships || []).map((m: any) => m.organization_id);
    const hasScope = targetOrgIds.some((orgId: string) => visibleOrgIds.includes(orgId));

    if (!hasScope) {
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
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
