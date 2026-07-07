import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";

const requestSchema = z.object({
  userId: z.string(),
});

import { corsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry();

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

    // anew_memberships has no FK constraints (confirmed via pg_constraint —
    // contype='f' returns zero rows), so PostgREST cannot auto-resolve an
    // embedded `role:anew_roles!inner(code)` select: it fails with PGRST200
    // ("Could not find a relationship..."). That error was previously
    // swallowed here (only `data` was destructured, never `error`), so
    // `callerMemberships` was always empty and this admin check rejected
    // every caller, including real super_admins. Fixed with the same
    // two-step query create-user's resolveCallerAdmin() already uses.
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

    // NOTE on audit logging for this function: anew_users has NO foreign key
    // to auth.users (see anew_users_auth_user_id_unique in
    // 20260615130000_baseline_new_database.sql — it is a plain nullable uuid
    // column with a UNIQUE constraint, not a FK), so there is NO cascade from
    // auth.admin.deleteUser() into anew_users. This function only ever removes
    // the auth.users row via the GoTrue Admin API — a separate REST call/
    // transaction that never touches public.anew_users and therefore can
    // never produce an entity_audit_log row for it. Previously this function
    // called set_audit_context() (SET LOCAL, transaction-scoped) before
    // deleteUser(), which had no effect at all: the GUC could not survive
    // into GoTrue's own transaction, and there was nothing here for
    // fn_audit_anew_users() to attribute regardless. That call (and the
    // matching clear_audit_context() in `finally`) has been removed as dead
    // code — it never fixed anything and only added two extra network calls
    // that could themselves fail and abort the delete before deleteUser() ran.
    //
    // The actual audit row for "delete user" is produced by the caller
    // (src/pages/UsersNew.tsx handleDelete): after this function succeeds, it
    // hard-deletes the public.anew_users row itself inside withAuditContext,
    // which the anew_users_delete RLS policy permits (users.delete permission)
    // and which trg_audit_anew_users (fn_audit_anew_users, DELETE branch)
    // audits with exactly one entity_audit_log row. This function's only
    // responsibility is removing the auth.users identity.
    const { error: deleteError } = await supabaseClient.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("auth.admin.deleteUser failed:", deleteError);
      return new Response(
        JSON.stringify({ error: deleteError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "User deleted successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    await captureError(error, { function: "delete-user" });
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
