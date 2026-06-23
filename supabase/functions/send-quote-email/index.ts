import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { resolveSmtpForAuthenticatedUser, sendEmailViaSMTP, sanitizeSmtpError, smtpNotFoundMessage } from "../_shared/smtp.ts";
import { z } from "npm:zod";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EmailAttachmentInput {
  filename: string;
  content: string; // base64
  contentType?: string;
}

interface EmailRequest {
  quote_id: string;
  recipient_email: string;
  recipient_name?: string;
  recipients?: string[];
  cc?: string[];
  subject?: string;
  message?: string;
  attachments?: EmailAttachmentInput[];
}

const requestSchema = z.object({
  quote_id: z.string(),
  recipient_email: z.string(),
  recipient_name: z.string().optional(),
  recipients: z.array(z.string()).optional(),
  cc: z.array(z.string()).optional(),
  subject: z.string().optional(),
  message: z.string().optional(),
  attachments: z.array(z.unknown()).optional(),
});

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

function generateQuoteEmailHtml(quote: any, customMessage?: string, senderName?: string, logoUrl?: string | null): string {
  const primaryColor = "#7c3aed";
  const quoteNumber = quote.quote_number || quote.id.slice(0, 8);
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="Logo" style="max-height:50px;margin-bottom:16px;display:inline-block;">`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Orçamento ${quoteNumber}</title></head>
<body style="margin:0;padding:0;font-family:'Inter',Arial,sans-serif;background-color:#f5f5f5;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
<tr><td style="background:linear-gradient(135deg,${primaryColor},#4c1d95);padding:40px;text-align:center;">
<h1 style="color:#ffffff;margin:0;font-size:24px;">Orçamento ${quoteNumber}</h1></td></tr>
<tr><td style="padding:40px;">
${customMessage ? `<p style="color:#374151;font-size:16px;line-height:1.6;margin-bottom:24px;white-space:pre-line;">${customMessage}</p>` : 
`<p style="color:#374151;font-size:16px;line-height:1.6;margin-bottom:24px;">${senderName ? `${senderName} enviou-lhe` : 'Foi-lhe enviado'} um orçamento para análise.</p>`}
</td></tr>
<tr><td style="background-color:#f9fafb;padding:24px;text-align:center;border-top:1px solid #e5e7eb;">
${logoHtml}
<p style="color:#9ca3af;font-size:12px;margin:0;">Este email foi enviado automaticamente.</p>
</td></tr></table></td></tr></table></body></html>`;
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

    const rawBody = await req.json();
    const parsed = requestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    const { quote_id, recipient_email, recipient_name, recipients, cc, subject, message, attachments } = parsed.data as EmailRequest;

    // Build To/Cc lists. The primary email (recipient_email) is what counts for tracking/state.
    const toListInput = sanitizeEmailList(recipients, 10);
    if (!toListInput.some((e) => e.toLowerCase() === recipient_email.toLowerCase())) {
      toListInput.unshift(recipient_email);
    }
    const ccList = sanitizeEmailList(cc, 10).filter(
      (e) => !toListInput.some((t) => t.toLowerCase() === e.toLowerCase())
    );

    // Sanitize attachments (defensive: enforce limits server-side too)
    const MAX_ATT_BYTES = 10 * 1024 * 1024;
    const MAX_TOTAL_ATT_BYTES = 22 * 1024 * 1024; // a bit of slack over client cap
    let safeAttachments: EmailAttachmentInput[] | undefined;
    if (Array.isArray(attachments) && attachments.length) {
      let total = 0;
      safeAttachments = [];
      for (const a of attachments) {
        if (!a?.filename || !a?.content) continue;
        const approxBytes = Math.floor((a.content.length * 3) / 4);
        if (approxBytes > MAX_ATT_BYTES) continue;
        if (total + approxBytes > MAX_TOTAL_ATT_BYTES) break;
        total += approxBytes;
        safeAttachments.push({
          filename: String(a.filename).slice(0, 255),
          content: a.content,
          contentType: a.contentType || "application/octet-stream",
        });
      }
      if (!safeAttachments.length) safeAttachments = undefined;
    }

    let userId: string | undefined;
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabaseClient.auth.getUser(token);
      userId = user?.id;
    }

    const { data: quote, error: quoteError } = await supabaseClient
      .from("quotes").select("*").eq("id", quote_id).single();
    if (quoteError || !quote) throw new Error("Quote not found");

    // ── Scope check: verify caller has access to quote's organization ──
    if (userId && quote.organization_id) {
      const { data: anewUser } = await supabaseClient.from("anew_users").select("id").eq("auth_user_id", userId).maybeSingle();
      if (anewUser) {
        const { data: membership } = await supabaseClient
          .from("anew_memberships")
          .select("id")
          .eq("user_id", anewUser.id)
          .eq("status", "active")
          .or(`organization_id.eq.${quote.organization_id}`)
          .maybeSingle();
        
        if (!membership) {
          const { data: userMemberships } = await supabaseClient.from("anew_memberships").select("organization_id").eq("user_id", anewUser.id).eq("status", "active");
          const userOrgIds = (userMemberships || []).map((m: any) => m.organization_id);
          const { data: hierarchyMatch } = await supabaseClient.from("anew_hierarchy").select("id").eq("child_org_id", quote.organization_id).in("parent_org_id", userOrgIds).maybeSingle();
          if (!hierarchyMatch) {
            throw new Error("Sem permissão para enviar este orçamento");
          }
        }
      }
    }

    let senderName: string | null = null;
    if (userId) {
      const { data: sender } = await supabaseClient
        .from("anew_users").select("display_name").eq("auth_user_id", userId).maybeSingle();
      senderName = sender?.display_name || null;
    }

    const resolvedSmtp = await resolveSmtpForAuthenticatedUser(supabaseClient, {
      authUserId: userId,
      organizationId: quote.organization_id,
    });

    if (!resolvedSmtp) {
      throw new Error(smtpNotFoundMessage());
    }
    const smtpConfig = resolvedSmtp.smtp;

    const emailSubject = subject || `Orçamento: ${quote.quote_number || quote.id.slice(0, 8)}`;
    let logoUrl: string | null = null;
    if (quote.organization_id) {
      try {
        const { data: docSettings } = await supabaseClient
          .from("organization_document_settings").select("logo_url").eq("organization_id", quote.organization_id).maybeSingle();
        logoUrl = docSettings?.logo_url ?? null;
        if (!logoUrl) {
          const { data: org } = await supabaseClient
            .from("anew_organizations").select("logo_url").eq("id", quote.organization_id).maybeSingle();
          logoUrl = org?.logo_url ?? null;
        }
      } catch (_) { /* logo opcional */ }
    }

    const emailHtml = generateQuoteEmailHtml(quote, message, senderName || undefined, logoUrl);

    await sendEmailViaSMTP(smtpConfig, { to: toListInput, cc: ccList.length ? ccList : undefined, subject: emailSubject, html: emailHtml, attachments: safeAttachments });

    // ── Tracking pós-envio (não falhar caller se algo abaixo falhar) ──
    let trackingOk = true;
    try {
      // Resolve business sender id
      let senderAnewUserId: string | null = null;
      if (userId) {
        const { data: anewUser } = await supabaseClient
          .from("anew_users").select("id").eq("auth_user_id", userId).maybeSingle();
        senderAnewUserId = anewUser?.id ?? null;
      }

      // Backfill quotes.entity_id se NULL via cliente_id
      let resolvedEntityId: string | null = quote.entity_id ?? null;
      if (!resolvedEntityId && quote.cliente_id) {
        const { data: client } = await supabaseClient
          .from("anew_clients").select("entity_id, organization_id").eq("id", quote.cliente_id).maybeSingle();
        if (client?.entity_id && (!quote.organization_id || quote.organization_id === client.organization_id)) {
          resolvedEntityId = client.entity_id;
          await supabaseClient.from("quotes").update({ entity_id: resolvedEntityId }).eq("id", quote_id);
        }
      }

      await supabaseClient.from("quotes").update({ estado: "enviado" }).eq("id", quote_id);

      await supabaseClient.from("quote_sends").insert({
        quote_id,
        organization_id: quote.organization_id,
        sent_by: senderAnewUserId,
        recipient_email,
        recipient_name: recipient_name || null,
        subject: emailSubject,
        message: ccList.length ? `${message || ""}${message ? "\n\n" : ""}CC: ${ccList.join(", ")}` : (message || null),
        status: "sent",
        sent_at: new Date().toISOString(),
      });

      await supabaseClient.from("email_logs").insert({
        organization_id: quote.organization_id,
        entity_id: resolvedEntityId,
        sent_by: senderAnewUserId,
        body_html: emailHtml,
        to_email: recipient_email,
        from_email: smtpConfig.from_email,
        subject: emailSubject,
        status: "sent",
        smtp_source: resolvedSmtp.source,
        smtp_id: smtpConfig.id,
        sent_at: new Date().toISOString(),
      });
    } catch (trackErr) {
      trackingOk = false;
      console.error("[send-quote-email] tracking incomplete", trackErr);
    }

    return new Response(
      JSON.stringify({ success: true, tracking: trackingOk ? "ok" : "partial" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    const safeError = sanitizeSmtpError(error);
    console.error("Error sending quote email:", safeError);
    return new Response(
      JSON.stringify({ error: safeError }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
