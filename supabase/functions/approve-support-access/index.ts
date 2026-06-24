import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCallerIdentity, authErrorResponse, AuthError } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { z } from "npm:zod";

const requestSchema = z.object({
  request_id: z.string().uuid(),
  action: z.enum(["approved", "rejected"]),
});

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // ── 1. Auth: user JWT required ─────────────────────────────────────────────
  let caller;
  try {
    caller = await resolveCallerIdentity(req, supabase);
  } catch (e) {
    return authErrorResponse(e, corsHeaders);
  }

  if (caller.isServiceRole) {
    return new Response(
      JSON.stringify({ error: "User JWT required to approve or reject support access" }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // ── 2. Zod parse before any I/O ───────────────────────────────────────────
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

  const { request_id, action } = parsed.data;

  try {
    // ── 3. Load the pending access request ────────────────────────────────────
    const { data: accessRequest, error: fetchError } = await supabase
      .from("support_access_log")
      .select("id, target_org_id, admin_user_id, duration_hours, reason, status")
      .eq("id", request_id)
      .maybeSingle();

    if (fetchError) {
      console.error("[approve-support-access] fetch error:", fetchError);
      throw new Error("Failed to look up support access request");
    }

    if (!accessRequest) {
      return new Response(
        JSON.stringify({ error: "Support access request not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (accessRequest.status !== "pending") {
      return new Response(
        JSON.stringify({
          error: "Request is no longer pending",
          current_status: accessRequest.status,
        }),
        { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const targetOrgId: string = accessRequest.target_org_id;

    // ── 4. Verify caller is super_admin of the target org ─────────────────────
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
      .eq("organization_id", targetOrgId)
      .eq("status", "active")
      .in("role_id", superAdminRoleIds)
      .maybeSingle();

    if (!membership) {
      throw new AuthError(
        "Only an active super_admin of this organisation can approve or reject support access",
        403
      );
    }

    // ── 5. Apply the decision using service-role client (table is append-only for authenticated) ──
    const now = new Date().toISOString();

    const updatePayload: Record<string, unknown> =
      action === "approved"
        ? {
            status: "approved",
            reviewed_at: now,
            reviewed_by: caller.anewUserId,
            expires_at: new Date(
              Date.now() + accessRequest.duration_hours * 60 * 60 * 1000
            ).toISOString(),
          }
        : {
            status: "rejected",
            reviewed_at: now,
            reviewed_by: caller.anewUserId,
          };

    const { error: updateError } = await supabase
      .from("support_access_log")
      .update(updatePayload)
      .eq("id", request_id)
      .eq("status", "pending"); // guard against concurrent decisions

    if (updateError) {
      console.error("[approve-support-access] update error:", updateError);
      throw new Error("Failed to record decision");
    }

    // ── 6. Notify the requesting sysadmin of the outcome ──────────────────────
    // ── 5b. Guard: requester cannot approve their own request ─────────────────
    if (caller.anewUserId === accessRequest.admin_user_id) {
      throw new AuthError("The requester cannot approve their own support access request", 403);
    }

    const { data: requester } = await supabase
      .from("anew_users")
      .select("email, name")
      .eq("id", accessRequest.admin_user_id)
      .maybeSingle();

    const { data: reviewerUser } = await supabase
      .from("anew_users")
      .select("name")
      .eq("id", caller.anewUserId)
      .maybeSingle();

    const { data: org } = await supabase
      .from("anew_organizations")
      .select("name")
      .eq("id", targetOrgId)
      .maybeSingle();

    if (requester?.email) {
      const html = buildOutcomeEmailHtml({
        requestId: request_id,
        action,
        orgName: org?.name ?? targetOrgId,
        requesterName: requester.name ?? "System administrator",
        reviewerName: reviewerUser?.name ?? "An organisation admin",
        durationHours: accessRequest.duration_hours,
      });

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            to: requester.email,
            subject: `[Olyvia] Support Access ${action === "approved" ? "Approved" : "Rejected"} — ${org?.name ?? targetOrgId}`,
            html,
            user_id: accessRequest.admin_user_id,
          }),
        });

        const result = await resp.json();
        if (result.error) {
          console.error("[approve-support-access] outcome email failed:", result.error);
        }
      } catch (emailErr) {
        // Non-fatal: decision is already persisted.
        console.error("[approve-support-access] outcome email dispatch error:", emailErr);
      }
    }

    return new Response(
      JSON.stringify({ request_id, status: action }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return authErrorResponse(err, corsHeaders);
    }
    console.error("[approve-support-access] unexpected error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});

// ── Email template ─────────────────────────────────────────────────────────────

interface OutcomeEmailParams {
  requestId: string;
  action: "approved" | "rejected";
  orgName: string;
  requesterName: string;
  reviewerName: string;
  durationHours: number;
}

function buildOutcomeEmailHtml(p: OutcomeEmailParams): string {
  const isApproved = p.action === "approved";
  const statusLabel = isApproved ? "Approved" : "Rejected";
  const statusColour = isApproved ? "#16a34a" : "#dc2626";

  const durationRow = isApproved
    ? `<tr>
        <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Access duration</td>
        <td style="padding: 8px; border: 1px solid #e5e7eb;">${p.durationHours} hour${p.durationHours !== 1 ? "s" : ""}</td>
       </tr>`
    : "";

  return `
<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><title>Support Access ${statusLabel}</title></head>
<body style="font-family: sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: ${statusColour};">Support Access ${escapeHtml(statusLabel)}</h2>
  <p>Dear ${escapeHtml(p.requesterName)},</p>
  <p>
    Your support access request for <strong>${escapeHtml(p.orgName)}</strong> has been
    <strong style="color: ${statusColour};">${escapeHtml(statusLabel.toLowerCase())}</strong>
    by ${escapeHtml(p.reviewerName)}.
  </p>
  <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
    <tr>
      <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Request ID</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(p.requestId)}</td>
    </tr>
    <tr>
      <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Organisation</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(p.orgName)}</td>
    </tr>
    ${durationRow}
  </table>
  ${isApproved ? "<p>You may now access the organisation within the approved window. All actions are logged.</p>" : "<p>If you believe this decision was made in error, please contact the organisation administrator directly.</p>"}
  <p style="font-size: 12px; color: #6b7280;">
    This is an automated security notification. Do not forward this email.
    Request ID: ${escapeHtml(p.requestId)}
  </p>
</body>
</html>`.trim();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
