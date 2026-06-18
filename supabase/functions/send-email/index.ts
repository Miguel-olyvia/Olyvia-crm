import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { resolveSmtpForAuthenticatedUser, resolveSmtpForScheduledEmail, sendEmailViaSMTP, sanitizeSmtpError, smtpNotFoundMessage } from "../_shared/smtp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EmailAttachment {
  filename: string;
  content: string; // base64 encoded
  contentType?: string;
}

interface EmailRequest {
  company_id?: string;
  organization_id?: string;
  user_id?: string;
  smtp_id?: string;
  entity_id?: string;
  to: string;
  recipients?: string[];
  cc?: string[];
  subject: string;
  html: string;
  text?: string;
  test?: boolean;
  attachments?: EmailAttachment[];
  smtp_config?: {
    host: string;
    port: number;
    username: string;
    password: string;
    secure: boolean;
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function sanitizeEmailList(list: unknown, max = 10): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of list) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!EMAIL_RE.test(trimmed)) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // ── Auth: resolve caller from JWT (verify_jwt=true ensures valid token) ──
    let callerAuthUid: string | undefined;
    let callerAnewUserId: string | undefined;
    let isServiceRole = false;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
        isServiceRole = true;
      } else {
        const { data: { user } } = await supabaseClient.auth.getUser(token);
        if (user) {
          callerAuthUid = user.id;
          const { data: anewUser } = await supabaseClient
            .from("anew_users")
            .select("id")
            .eq("auth_user_id", user.id)
            .maybeSingle();
          callerAnewUserId = anewUser?.id;
        }
      }
    }

    const body: EmailRequest = await req.json();
    const { company_id, organization_id, user_id, smtp_id, entity_id, to, recipients, cc, subject, html, text, test, smtp_config, attachments } = body;
    const toListInput = sanitizeEmailList(recipients, 10);
    if (to && !toListInput.some((e) => e.toLowerCase() === to.toLowerCase())) {
      toListInput.unshift(to);
    }
    const ccList = sanitizeEmailList(cc, 10).filter((e) => !toListInput.some((t) => t.toLowerCase() === e.toLowerCase()));

    // ── Scope check: validate organization access (skip for service role & test mode) ──
    if (!isServiceRole && !test && organization_id && callerAnewUserId) {
      const { data: membership } = await supabaseClient
        .from("anew_memberships")
        .select("id")
        .eq("user_id", callerAnewUserId)
        .eq("organization_id", organization_id)
        .eq("status", "active")
        .maybeSingle();

      if (!membership) {
        // Check hierarchy
        const { data: userMemberships } = await supabaseClient
          .from("anew_memberships")
          .select("organization_id")
          .eq("user_id", callerAnewUserId)
          .eq("status", "active");

        const userOrgIds = (userMemberships || []).map((m: any) => m.organization_id);
        const { data: hierarchyMatch } = await supabaseClient
          .from("anew_hierarchy")
          .select("id")
          .eq("child_org_id", organization_id)
          .in("parent_org_id", userOrgIds)
          .maybeSingle();

        if (!hierarchyMatch) {
          return new Response(
            JSON.stringify({ error: "Sem permissão para enviar emails desta organização" }),
            { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
      }
    }

    // SMTP identity: auth_user_id for user calls; service-role scheduled/internal calls resolve user_id defensively.
    const resolvedAuthUserId = isServiceRole ? undefined : callerAuthUid;

    // Test mode: keep HTTP 200 so the UI can show the real sanitized SMTP error
    // instead of the generic "Edge Function returned a non-2xx status code".
    if (test && smtp_config && to && subject && html) {
      console.log("Testing SMTP connection to:", smtp_config.host);
      try {
        const emailResult = await sendEmailViaSMTP(smtp_config, { to, subject, html, text });
        console.log("SMTP test successful:", emailResult);
        return new Response(
          JSON.stringify({ success: true, messageId: emailResult.messageId, test: true }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } catch (testError) {
        const safeError = sanitizeSmtpError(testError);
        console.error("SMTP test failed:", safeError);
        return new Response(
          JSON.stringify({ success: false, error: safeError, test: true }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    if (!to || !subject || !html) {
      throw new Error("Missing required fields: to, subject, html");
    }

    const resolved = isServiceRole && user_id
      ? await resolveSmtpForScheduledEmail(supabaseClient, { scheduledUserId: user_id, organizationId: organization_id || company_id })
      : await resolveSmtpForAuthenticatedUser(supabaseClient, {
          authUserId: resolvedAuthUserId,
          organizationId: organization_id || company_id,
          smtpId: smtp_id,
        });

    if (!resolved) {
      throw new Error(smtpNotFoundMessage());
    }

    const { smtp: smtpConfig, source } = resolved;

    if (smtpConfig.daily_limit) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count } = await supabaseClient
        .from("email_logs")
        .select("*", { count: "exact", head: true })
        .eq("smtp_id", smtpConfig.id)
        .gte("sent_at", today.toISOString())
        .eq("status", "sent");
      if (count && count >= smtpConfig.daily_limit) {
        throw new Error(`Limite diário atingido para este SMTP (${smtpConfig.from_email})`);
      }
    }

    const emailResult = await sendEmailViaSMTP(smtpConfig, { to: toListInput.length ? toListInput : to, cc: ccList.length ? ccList : undefined, subject, html, text, attachments });

    try {
      await supabaseClient.from("email_logs").insert({
        organization_id: organization_id || null,
        user_id: user_id || null,
        entity_id: entity_id || null,
        sent_by: callerAnewUserId || null,
        body_html: html,
        to_email: to,
        from_email: smtpConfig.from_email,
        subject,
        status: "sent",
        smtp_source: source,
        smtp_id: smtpConfig.id,
        sent_at: new Date().toISOString(),
      });
    } catch (logErr) {
      console.error("[send-email] tracking incomplete", logErr);
    }

    console.log("Email sent", { ...resolved.metadata, messageId: emailResult.messageId });

    return new Response(
      JSON.stringify({ success: true, messageId: emailResult.messageId, source }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    const safeError = sanitizeSmtpError(error);
    console.error("Error sending email:", safeError);

    try {
      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );
      await supabaseClient.from("email_logs").insert({
        to_email: "",
        from_email: "",
        subject: "",
        status: "failed",
        error_message: safeError,
      });
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    return new Response(
      JSON.stringify({ error: safeError }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
