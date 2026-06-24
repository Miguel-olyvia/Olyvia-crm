import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCallerIdentity, authErrorResponse, AuthError } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { z } from "npm:zod";

const requestSchema = z.object({
  org_id: z.string().uuid(),
  reason: z.string().min(10),
  duration_hours: z.number().int().min(1).max(8),
});

serve(async (req: Request): Promise<Response> => {
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

    // ── 6. Fetch super_admin(s) for the target org ────────────────────────────
    const { data: superAdmins, error: adminError } = await supabase
      .from("anew_memberships")
      .select("user_id, anew_users!inner(id, email, name)")
      .eq("organization_id", org_id)
      .eq("status", "active")
      .eq("anew_roles!inner(code)", "super_admin");

    // Fallback query if the join syntax above is not supported — use two-step lookup
    let adminUsers: Array<{ id: string; email: string; name: string }> = [];

    if (adminError || !superAdmins || superAdmins.length === 0) {
      // Two-step: find role id for super_admin in this org or global, then find memberships
      const { data: roleRows } = await supabase
        .from("anew_roles")
        .select("id")
        .eq("code", "super_admin");

      const roleIds = (roleRows || []).map((r: { id: string }) => r.id);

      if (roleIds.length > 0) {
        const { data: memberships } = await supabase
          .from("anew_memberships")
          .select("user_id")
          .eq("organization_id", org_id)
          .eq("status", "active")
          .in("role_id", roleIds);

        const userIds = (memberships || []).map((m: { user_id: string }) => m.user_id);

        if (userIds.length > 0) {
          const { data: users } = await supabase
            .from("anew_users")
            .select("id, email, name")
            .in("id", userIds)
            .eq("status", "active");

          adminUsers = (users || []) as Array<{ id: string; email: string; name: string }>;
        }
      }
    } else {
      adminUsers = (superAdmins as any[]).map((row) => row.anew_users);
    }

    // ── 7. Fetch caller name for the email notification ───────────────────────
    const { data: callerUser } = await supabase
      .from("anew_users")
      .select("name, email")
      .eq("id", caller.anewUserId)
      .maybeSingle();

    const callerName = callerUser?.name ?? "A system administrator";
    const approvalLink = `${Deno.env.get("SUPABASE_URL")}/functions/v1/approve-support-access`;

    // ── 8. Send notification email to each super_admin ────────────────────────
    const emailPromises = adminUsers.map(async (admin) => {
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

    await Promise.all(emailPromises);

    return new Response(
      JSON.stringify({ request_id: requestId, status: "pending" }),
      { status: 201, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return authErrorResponse(err, corsHeaders);
    }
    console.error("[request-support-access] unexpected error:", err);
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
    to your organisation <strong>${escapeHtml(p.orgName)}</strong>.
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
