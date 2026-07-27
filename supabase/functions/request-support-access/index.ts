import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCallerIdentity, authErrorResponse, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { z } from "npm:zod";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry();

const requestSchema = z.object({
  org_id: z.string().uuid(),
  reason: z.string().min(10),
  duration_hours: z.number().int().min(1).max(8),
});

serve(async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // ── 1. Auth: JWT required, no service-role bypass ─────────────────────────
  let caller;
  try {
    caller = await resolveCallerIdentity(req, supabase);
  } catch (e) {
    return authErrorResponse(e, corsHeaders);
  }

  if (caller.isServiceRole) {
    return new Response(
      JSON.stringify({ error: "User JWT required for support access requests" }),
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

  const { org_id, reason, duration_hours } = parsed.data;

  try {
    // ── 3. Verify caller is system_admin via get_user_context RPC ─────────────
    const { data: ctx, error: ctxError } = await supabase.rpc("get_user_context", {
      _auth_user_id: caller.authUid,
    });

    if (ctxError) {
      console.error("[request-support-access] get_user_context error:", ctxError);
      throw new AuthError("Failed to resolve user context", 500);
    }

    if (!ctx?.is_system_admin) {
      throw new AuthError("Only system admins can request support access", 403);
    }

    // ── 4. Verify target org exists ───────────────────────────────────────────
    const { data: org, error: orgError } = await supabase
      .from("anew_organizations")
      .select("id, name")
      .eq("id", org_id)
      .eq("status", "active")
      .maybeSingle();

    if (orgError) {
      console.error("[request-support-access] org lookup error:", orgError);
      throw new Error("Failed to look up organization");
    }

    if (!org) {
      return new Response(
        JSON.stringify({ error: "Organization not found or inactive" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ── 5. Insert pending request into support_access_log ─────────────────────
    const { data: logEntry, error: insertError } = await supabase
      .from("support_access_log")
      .insert({
        admin_user_id: caller.anewUserId,
        target_org_id: org_id,
        reason,
        duration_hours,
        status: "pending",
        requested_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[request-support-access] insert error:", insertError);
      throw new Error("Failed to create support access request");
    }

    const requestId: string = logEntry.id;

    // ── 6. Fetch other system_admin(s) to approve, and super_admin(s) to notify ──
    // Approval must stay internal to Olyvia (see approve-support-access) — it
    // cannot depend on the client-org super_admin being reachable at odd hours.
    // The client-org super_admin is still notified, for transparency, but has
    // no approve/reject action.
    // anew_memberships has no FK constraints, so PostgREST cannot resolve an
    // embedded `anew_roles!inner(code)` filter/select (PGRST200). Resolve
    // with decoupled two-step lookups instead.
    let approverUsers: Array<{ id: string; email: string; name: string }> = [];
    let fyiUsers: Array<{ id: string; email: string; name: string }> = [];

    const { data: roleRows, error: roleError } = await supabase
      .from("anew_roles")
      .select("id, code")
      .in("code", ["system_admin", "super_admin"]);

    if (roleError) {
      console.error("[request-support-access] error fetching role ids:", roleError);
    }

    const systemAdminRoleIds = (roleRows || [])
      .filter((r: { code: string }) => r.code === "system_admin")
      .map((r: { id: string }) => r.id);
    const superAdminRoleIds = (roleRows || [])
      .filter((r: { code: string }) => r.code === "super_admin")
      .map((r: { id: string }) => r.id);

    if (systemAdminRoleIds.length > 0) {
      const { data: memberships, error: membershipsError } = await supabase
        .from("anew_memberships")
        .select("user_id")
        .eq("status", "active")
        .in("role_id", systemAdminRoleIds)
        .limit(200);

      if (membershipsError) {
        console.error("[request-support-access] error fetching system_admin memberships:", membershipsError);
      }

      const userIds = (memberships || [])
        .map((m: { user_id: string }) => m.user_id)
        .filter((id: string) => id !== caller.anewUserId);

      if (userIds.length > 0) {
        const { data: users, error: usersError } = await supabase
          .from("anew_users")
          .select("id, email, name")
          .in("id", userIds)
          .eq("status", "active");

        if (usersError) {
          console.error("[request-support-access] error fetching system_admin users:", usersError);
        }

        approverUsers = (users || []) as Array<{ id: string; email: string; name: string }>;
      }
    }

    if (superAdminRoleIds.length > 0) {
      const { data: memberships, error: membershipsError } = await supabase
        .from("anew_memberships")
        .select("user_id")
        .eq("organization_id", org_id)
        .eq("status", "active")
        .in("role_id", superAdminRoleIds);

      if (membershipsError) {
        console.error("[request-support-access] error fetching super_admin memberships:", membershipsError);
      }

      const userIds = (memberships || []).map((m: { user_id: string }) => m.user_id);

      if (userIds.length > 0) {
        const { data: users, error: usersError } = await supabase
          .from("anew_users")
          .select("id, email, name")
          .in("id", userIds)
          .eq("status", "active");

        if (usersError) {
          console.error("[request-support-access] error fetching super_admin users:", usersError);
        }

        fyiUsers = (users || []) as Array<{ id: string; email: string; name: string }>;
      }
    }

    // ── 7. Fetch caller name for the email notification ───────────────────────
    const { data: callerUser } = await supabase
      .from("anew_users")
      .select("name, email")
      .eq("id", caller.anewUserId)
      .maybeSingle();

    const callerName = callerUser?.name ?? "A system administrator";
    const approvalLink = `${Deno.env.get("SUPABASE_URL")}/functions/v1/approve-support-access`;

    // ── 8. Send approval-request email to other system_admins, FYI to super_admin(s) ──
    const approvalEmailPromises = approverUsers.map(async (admin) => {
      const html = buildNotificationEmailHtml({
        requestId,
        orgName: org.name,
        reason,
        durationHours: duration_hours,
        callerName,
        adminName: admin.name,
        approvalLink,
      });

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            to: admin.email,
            subject: `[Olyvia] Support Access Request — ${org.name}`,
            html,
            user_id: admin.id,
            organization_id: org_id,
          }),
        });

        const result = await resp.json();
        if (result.error) {
          console.error("[request-support-access] email failed for", admin.email, result.error);
        }
      } catch (emailErr) {
        // Non-fatal: the access request is already persisted; notification failure
        // should not roll back the request.
        console.error("[request-support-access] email dispatch error:", emailErr);
      }
    });

    const fyiEmailPromises = fyiUsers.map(async (admin) => {
      const html = buildFyiEmailHtml({
        orgName: org.name,
        reason,
        durationHours: duration_hours,
        callerName,
        adminName: admin.name,
      });

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            to: admin.email,
            subject: `[Olyvia] Support Access Notice — ${org.name}`,
            html,
            user_id: admin.id,
            organization_id: org_id,
          }),
        });

        const result = await resp.json();
        if (result.error) {
          console.error("[request-support-access] FYI email failed for", admin.email, result.error);
        }
      } catch (emailErr) {
        console.error("[request-support-access] FYI email dispatch error:", emailErr);
      }
    });

    await Promise.all([...approvalEmailPromises, ...fyiEmailPromises]);

    return new Response(
      JSON.stringify({ request_id: requestId, status: "pending" }),
      { status: 201, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return authErrorResponse(err, corsHeaders);
    }
    console.error("[request-support-access] unexpected error:", err);
    await captureError(err, { function: "request-support-access" });
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});

// ── Email template ─────────────────────────────────────────────────────────────

interface NotificationEmailParams {
  requestId: string;
  orgName: string;
  reason: string;
  durationHours: number;
  callerName: string;
  adminName: string;
  approvalLink: string;
}

function buildNotificationEmailHtml(p: NotificationEmailParams): string {
  return `
<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><title>Support Access Request</title></head>
<body style="font-family: sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #2563eb;">Support Access Request</h2>
  <p>Dear ${escapeHtml(p.adminName)},</p>
  <p>
    <strong>${escapeHtml(p.callerName)}</strong> has requested temporary support access
    to organisation <strong>${escapeHtml(p.orgName)}</strong>. As a fellow system admin,
    your review is requested.
  </p>
  <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
    <tr>
      <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Request ID</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(p.requestId)}</td>
    </tr>
    <tr>
      <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Reason</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(p.reason)}</td>
    </tr>
    <tr>
      <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Duration requested</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb;">${p.durationHours} hour${p.durationHours !== 1 ? "s" : ""}</td>
    </tr>
  </table>
  <p>To approve or reject this request, use the Olyvia dashboard or contact Olyvia support.</p>
  <p style="font-size: 12px; color: #6b7280;">
    This is an automated security notification. Do not forward this email.
    Request ID: ${escapeHtml(p.requestId)}
  </p>
</body>
</html>`.trim();
}

interface FyiEmailParams {
  orgName: string;
  reason: string;
  durationHours: number;
  callerName: string;
  adminName: string;
}

function buildFyiEmailHtml(p: FyiEmailParams): string {
  return `
<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><title>Support Access Notice</title></head>
<body style="font-family: sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #2563eb;">Support Access Notice</h2>
  <p>Dear ${escapeHtml(p.adminName)},</p>
  <p>
    <strong>${escapeHtml(p.callerName)}</strong>, an Olyvia system administrator, has
    requested temporary support access to your organisation
    <strong>${escapeHtml(p.orgName)}</strong>. This is a notice only — approval is
    handled internally by Olyvia and does not require any action from you.
  </p>
  <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
    <tr>
      <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Reason</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(p.reason)}</td>
    </tr>
    <tr>
      <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Duration requested</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb;">${p.durationHours} hour${p.durationHours !== 1 ? "s" : ""}</td>
    </tr>
  </table>
  <p>All access under this request is logged and time-limited. If you have concerns, contact Olyvia support.</p>
  <p style="font-size: 12px; color: #6b7280;">
    This is an automated security notification. Do not forward this email.
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
