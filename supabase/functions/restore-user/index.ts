import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";

const requestSchema = z.object({
  userId: z.string(),
});

import { getCorsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";

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

    const { data: callerMemberships, error: callerMembershipsError } = await supabaseClient
      .from("anew_memberships")
      .select("organization_id, role_id")
      .eq("user_id", callerAnew.id)
      .eq("status", "active");

    if (callerMembershipsError) {
      console.error("Error fetching caller memberships:", callerMembershipsError);
    }

    const callerRoleIds = [...new Set((callerMemberships || []).map((m: any) => m.role_id).filter(Boolean))];
    let callerRoles: string[] = [];
    if (callerRoleIds.length > 0) {
      const { data: callerRoleRows, error: callerRolesError } = await supabaseClient
        .from("anew_roles")
        .select("code")
        .in("id", callerRoleIds);
      if (callerRolesError) {
        console.error("Error fetching caller role codes:", callerRolesError);
      } else {
        callerRoles = [...new Set((callerRoleRows || []).map((r: any) => r.code).filter(Boolean))];
      }
    }
    const adminRoles = ["system_admin", "super_admin", "org_admin"];
    const callerIsAdmin = callerRoles.some(r => adminRoles.includes(r));

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

    // Scope check: if not system_admin, verify target user is in visible orgs
    const isSystemAdmin = callerRoles.includes("system_admin");

    if (!isSystemAdmin) {
      const { data: visibleOrgs } = await supabaseClient.rpc("get_user_visible_org_ids", {
        _auth_uid: user.id,
      });

      const visibleOrgIds = (visibleOrgs || []).map((r: any) => r.organization_id || r);

      const { data: targetAnew } = await supabaseClient
        .from("anew_users")
        .select("id")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (targetAnew) {
        const { data: targetMemberships } = await supabaseClient
          .from("anew_memberships")
          .select("organization_id")
          .eq("user_id", targetAnew.id);

        const targetOrgIds = (targetMemberships || []).map((m: any) => m.organization_id);
        const hasScope = targetOrgIds.some((orgId: string) => visibleOrgIds.includes(orgId));

        if (!hasScope) {
          return new Response(
            JSON.stringify({ error: "Target user not in your organizational scope" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
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
