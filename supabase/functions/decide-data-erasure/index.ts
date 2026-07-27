import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCallerIdentity, authErrorResponse, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { z } from "npm:zod";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry();

// RGPD Art. 17 — right to erasure. Step 2 of 2 (approval + execution).
//
// Only an active super_admin of the request's organization_id, or a
// system_admin, may decide a pending request — and never the requester
// themselves (mirrors approve-support-access's self-approval guard, enforced
// both here and at the storage layer via
// data_erasure_requests_no_self_review).
//
// On approval, execute_entity_erasure() runs immediately and synchronously —
// there is no separate "approved but not yet executed" window a human could
// intervene in, which keeps the audit trail simple: a request is either
// pending, rejected, or completed/failed with the outcome already recorded.

const requestSchema = z.object({
  request_id: z.string().uuid(),
  action: z.enum(["approved", "rejected"]),
  rejection_reason: z.string().min(5).optional(),
});

serve(async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let caller;
  try {
    caller = await resolveCallerIdentity(req, supabase);
  } catch (e) {
    return authErrorResponse(e, corsHeaders);
  }

  if (caller.isServiceRole) {
    return new Response(
      JSON.stringify({ error: "User JWT required to decide a data erasure request" }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const { request_id, action, rejection_reason } = parsed.data;

  if (action === "rejected" && !rejection_reason) {
    return new Response(
      JSON.stringify({ error: "rejection_reason is required when rejecting a request" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  try {
    // ── 1. Load the pending request ────────────────────────────────────────
    const { data: reqRow, error: fetchError } = await supabase
      .from("data_erasure_requests")
      .select("id, entity_id, organization_id, requested_by, status")
      .eq("id", request_id)
      .maybeSingle();

    if (fetchError) {
      console.error("[decide-data-erasure] fetch error:", fetchError);
      throw new Error("Failed to look up data erasure request");
    }

    if (!reqRow) {
      return new Response(
        JSON.stringify({ error: "Data erasure request not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (reqRow.status !== "pending") {
      return new Response(
        JSON.stringify({ error: "Request is no longer pending", current_status: reqRow.status }),
        { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Self-approval guard — mirrors approve-support-access.
    if (caller.anewUserId === reqRow.requested_by) {
      throw new AuthError("The requester cannot decide their own erasure request", 403);
    }

    // ── 2. Verify caller is super_admin of the org, or system_admin ─────────
    const { data: ctx, error: ctxError } = await supabase.rpc("get_user_context", {
      _auth_user_id: caller.authUid,
    });

    if (ctxError) {
      console.error("[decide-data-erasure] get_user_context error:", ctxError);
      throw new AuthError("Failed to resolve user context", 500);
    }

    const isSystemAdmin = Boolean(ctx?.is_system_admin);

    if (!isSystemAdmin) {
      const { data: roleRows } = await supabase
        .from("anew_roles")
        .select("id")
        .eq("code", "super_admin");

      const superAdminRoleIds = (roleRows || []).map((r: { id: string }) => r.id);

      if (superAdminRoleIds.length === 0) {
        throw new AuthError("super_admin role not configured", 500);
      }

      const { data: membership } = await supabase
        .from("anew_memberships")
        .select("id")
        .eq("user_id", caller.anewUserId)
        .eq("organization_id", reqRow.organization_id)
        .eq("status", "active")
        .in("role_id", superAdminRoleIds)
        .maybeSingle();

      if (!membership) {
        throw new AuthError(
          "Only an active super_admin of this organisation (or a system_admin) can decide a data erasure request",
          403
        );
      }
    }

    const now = new Date().toISOString();

    // ── 3. Rejection: single append-only update, no execution ───────────────
    if (action === "rejected") {
      const { data: updatedRows, error: updateError } = await supabase
        .from("data_erasure_requests")
        .update({
          status: "rejected",
          reviewed_at: now,
          reviewed_by: caller.anewUserId,
          rejection_reason,
        })
        .eq("id", request_id)
        .eq("status", "pending")
        .select("id");

      if (updateError) {
        console.error("[decide-data-erasure] reject update error:", updateError);
        throw new Error("Failed to record rejection");
      }

      if (!updatedRows || updatedRows.length === 0) {
        return new Response(
          JSON.stringify({ error: "Request was already decided by another reviewer" }),
          { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      return new Response(
        JSON.stringify({ request_id, status: "rejected" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ── 4. Approval: flip to 'approved' first (filtered on current status to
    //      avoid a phantom double-execution on concurrent decisions), then
    //      immediately invoke execute_entity_erasure() via service_role. ────
    const { data: approvedRows, error: approveError } = await supabase
      .from("data_erasure_requests")
      .update({
        status: "approved",
        reviewed_at: now,
        reviewed_by: caller.anewUserId,
      })
      .eq("id", request_id)
      .eq("status", "pending")
      .select("id");

    if (approveError) {
      console.error("[decide-data-erasure] approve update error:", approveError);
      throw new Error("Failed to record approval");
    }

    if (!approvedRows || approvedRows.length === 0) {
      return new Response(
        JSON.stringify({ error: "Request was already decided by another reviewer" }),
        { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: execResult, error: execError } = await supabase.rpc("execute_entity_erasure", {
      p_request_id: request_id,
    });

    if (execError) {
      // execute_entity_erasure() already flips the row to 'failed' with
      // error_message set inside its own EXCEPTION handler before re-raising,
      // so there is nothing further to persist here — just surface the error.
      console.error("[decide-data-erasure] execution error:", execError);
      return new Response(
        JSON.stringify({
          error: "Approval recorded, but execution failed. See data_erasure_requests.error_message.",
          request_id,
          status: "failed",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ request_id, status: "completed", result: execResult }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return authErrorResponse(err, corsHeaders);
    }
    console.error("[decide-data-erasure] unexpected error:", err);
    await captureError(err, { function: "decide-data-erasure" });
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
