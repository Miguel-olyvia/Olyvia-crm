import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";

const requestSchema = z.object({
  userId: z.string(),
});

import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
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

    // Admin check via anew_memberships + anew_roles
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

    const { data: callerMemberships } = await supabaseClient
      .from("anew_memberships")
      .select("organization_id, role:anew_roles!inner(code)")
      .eq("user_id", callerAnew.id)
      .eq("status", "active");

    const callerRoles = [...new Set((callerMemberships || []).map((m: any) => m.role?.code).filter(Boolean))];
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
      // Get caller's visible org IDs via the DB function
      const { data: visibleOrgs } = await supabaseClient.rpc("get_user_visible_org_ids", {
        _auth_uid: user.id,
      });

      const visibleOrgIds = (visibleOrgs || []).map((r: any) => r.organization_id || r);

      // Get target user's memberships
      const { data: targetAnew } = await supabaseClient
        .from("anew_users")
        .select("id")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (targetAnew) {
        const { data: targetMemberships } = await supabaseClient
          .from("anew_memberships")
          .select("organization_id")
          .eq("user_id", targetAnew.id)
          .eq("status", "active");

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

    // Set audit context for this transaction's writes. The cascade triggered by
    // auth.admin.deleteUser() removes the anew_users row (and dependent rows via
    // FK), so fn_audit_anew_users() needs app.audit_user_id/app.audit_source set
    // before the delete to attribute the audit log entry to the calling admin
    // instead of falling back to the service role.
    // See: supabase/migrations/20260709010000_users_audit_triggers.sql
    const { error: setAuditCtxError } = await supabaseClient.rpc("set_audit_context", {
      p_user_id: callerAnew.id,
      p_source: "web_app",
    });
    if (setAuditCtxError) {
      console.error("Failed to set audit context:", setAuditCtxError);
      return new Response(
        JSON.stringify({ error: setAuditCtxError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    try {
      // Delete the user via admin API (cascade handles anew_users FK)
      const { error: deleteError } = await supabaseClient.auth.admin.deleteUser(userId);

      if (deleteError) {
        return new Response(
          JSON.stringify({ error: deleteError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "User deleted successfully" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } finally {
      // clear_audit_context failure must never mask the delete's outcome. SET
      // LOCAL also clears automatically at transaction end regardless.
      const { error: clearCtxError } = await supabaseClient.rpc("clear_audit_context");
      if (clearCtxError) {
        console.error("Failed to clear audit context:", clearCtxError);
      }
    }
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
