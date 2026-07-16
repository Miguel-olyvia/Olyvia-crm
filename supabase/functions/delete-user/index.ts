import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";

const requestSchema = z.object({
  userId: z.string(),
});

import { getCorsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry();

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
    // column with a UNIQUE constraint, not a FK). This function only ever
    // touches the auth.users identity via the GoTrue Admin API — a separate
    // REST call/transaction that never touches public.anew_users and
    // therefore never produces an entity_audit_log row on its own.
    //
    // Deactivation (was: hard delete) — 20261107090000
    // -------------------------------------------------
    // Deleting a user must be recoverable (product decision: mirror HubSpot's
    // "deactivate" pattern — cut login access, keep the profile and
    // everything it owns intact). A SECURITY DEFINER SQL function cannot
    // perform auth.users admin operations in this project (see
    // 20260720010000), so blocking login has to happen here, via the
    // service-role GoTrue Admin API:
    //   · auth.admin.updateUserById(userId, { ban_duration }) — Supabase Auth
    //     has no literal "forever" ban; an extremely long duration (~100
    //     years) is the documented convention for "banned until an admin
    //     explicitly restores the account" (see restore-user Edge Function).
    //   · auth.admin.signOut(userId, 'global') — invalidates any refresh
    //     tokens/sessions already issued, so the ban takes effect immediately
    //     rather than only on the next token refresh.
    //
    // The caller (src/pages/UsersNew.tsx handleDelete) then calls
    // rpc_delete_user, which marks public.anew_users as
    // status='inactive'/deleted_at=now() in a single transaction and writes
    // the one entity_audit_log row for this action (table_name='anew_users',
    // operation='UPDATE', source='web_app'). Nothing here or in that RPC
    // deletes any row or touches any other table the user owns.
    const ONE_HUNDRED_YEARS_HOURS = "876000h";

    const { error: banError } = await supabaseClient.auth.admin.updateUserById(userId, {
      ban_duration: ONE_HUNDRED_YEARS_HOURS,
    });

    if (banError) {
      console.error("auth.admin.updateUserById (ban) failed:", banError);
      return new Response(
        JSON.stringify({ error: banError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: signOutError } = await supabaseClient.auth.admin.signOut(userId, "global");
    if (signOutError) {
      // Non-fatal: the ban itself already blocks future logins/refreshes.
      // A live, not-yet-expired access token could still work until it
      // naturally expires if this call fails, but the account is banned.
      console.error("auth.admin.signOut failed (non-fatal, user is already banned):", signOutError);
    }

    return new Response(
      JSON.stringify({ success: true, message: "User deactivated successfully" }),
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
