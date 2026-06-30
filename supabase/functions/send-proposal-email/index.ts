import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { resolveSmtpForAuthenticatedUser, sendEmailViaSMTP, sanitizeSmtpError, smtpNotFoundMessage } from "../_shared/smtp.ts";
import { z } from "npm:zod";

import { corsHeadersExtended as corsHeaders } from "../_shared/cors.ts";

interface EmailRequest {
  proposal_id: string;
  sender_user_id?: string;
  recipient_email: string;
  recipient_name?: string;
  recipients?: string[];
  cc?: string[];
  subject?: string;
  message?: string;
}

const requestSchema = z.object({
  proposal_id: z.string(),
  sender_user_id: z.string().optional(),
  recipient_email: z.string(),
  recipient_name: z.string().optional(),
  recipients: z.array(z.string()).optional(),
  cc: z.array(z.string()).optional(),
  subject: z.string().optional(),
  message: z.string().optional(),
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Generate proposal email HTML
function generateProposalEmailHtml(
  proposal: any,
  publicUrl: string,
  customMessage?: string,
  senderName?: string
): string {
  const template = proposal.proposal_templates;
  const primaryColor = template?.primary_color || "#3b82f6";
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${proposal.title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${primaryColor}, #1e40af); padding: 40px; text-align: center;">
              ${proposal.proposal_templates?.logo_url ? 
                `<img src="${proposal.proposal_templates.logo_url}" alt="Logo" style="max-height: 60px; margin-bottom: 20px;">` : ''
              }
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">${proposal.title}</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              ${customMessage ? `
                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                  ${escapeHtml(customMessage)}
                </p>
              ` : `
                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                  ${senderName ? `${senderName} enviou-lhe` : 'Foi-lhe enviada'} uma proposta para análise.
                </p>
              `}
              
              ${proposal.description ? `
                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
                  ${escapeHtml(proposal.description?.substring(0, 200) ?? '')}${proposal.description.length > 200 ? '...' : ''}
                </p>
              ` : ''}
              
              <!-- Value Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px; text-align: center;">
                    <p style="color: #6b7280; margin: 0 0 8px 0; font-size: 14px;">Valor da Proposta</p>
                    <p style="color: ${primaryColor}; margin: 0; font-size: 32px; font-weight: bold;">
                      ${new Intl.NumberFormat('pt-PT', { style: 'currency', currency: proposal.currency || 'EUR' }).format(proposal.value)}
                    </p>
                  </td>
                </tr>
              </table>
              
              ${proposal.valid_until ? `
                <p style="color: #6b7280; font-size: 14px; text-align: center; margin-bottom: 24px;">
                  Válida até: <strong>${new Date(proposal.valid_until).toLocaleDateString('pt-PT')}</strong>
                </p>
              ` : ''}
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${publicUrl}" style="display: inline-block; background-color: ${primaryColor}; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      Ver Proposta Completa
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                Enviado automaticamente
              </p>
              ${template?.footer_text ? `
                <p style="color: #9ca3af; font-size: 12px; margin: 8px 0 0 0;">
                  ${template.footer_text}
                </p>
              ` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
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
    const { proposal_id, recipient_email, recipient_name, recipients, cc, subject, message } = parsed.data;
    const toListInput = sanitizeEmailList(recipients, 10);
    if (recipient_email && !toListInput.some((e) => e.toLowerCase() === recipient_email.toLowerCase())) {
      toListInput.unshift(recipient_email);
    }
    const ccList = sanitizeEmailList(cc, 10).filter((e) => !toListInput.some((t) => t.toLowerCase() === e.toLowerCase()));

    // ── Auth: mandatory JWT — reject immediately without Authorization header ──
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: callerUser }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !callerUser) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const userId: string = callerUser.id;

    // Get proposal with all related data
    const { data: proposal, error: proposalError } = await supabaseClient
      .from("proposals")
      .select(`
        *,
        proposal_templates!template_id(
          logo_url, primary_color, secondary_color, footer_text
        ),
        quotes!proposal_id(id, estado)
      `)
      .eq("id", proposal_id)
      .single();

    if (proposalError || !proposal) {
      throw new Error("Proposal not found");
    }

    // ── Scope check: verify caller has access to proposal's organization ──
    // Also resolve anewUser into outer scope so we can use its id below as
    // proposal_sends.sent_by (identity boundary: business id, not auth.uid()).
    let senderAnewUserId: string | null = null;
    if (userId && proposal.organization_id) {
      const { data: anewUser } = await supabaseClient.from("anew_users").select("id").eq("auth_user_id", userId).maybeSingle();
      if (!anewUser) {
        throw new Error("Utilizador não encontrado no sistema");
      }
      senderAnewUserId = anewUser.id;
      const { data: membership } = await supabaseClient
        .from("anew_memberships")
        .select("id")
        .eq("user_id", anewUser.id)
        .eq("status", "active")
        .or(`organization_id.eq.${proposal.organization_id}`)
        .maybeSingle();

      if (!membership) {
        const { data: userMemberships } = await supabaseClient.from("anew_memberships").select("organization_id").eq("user_id", anewUser.id).eq("status", "active");
        const userOrgIds = (userMemberships || []).map((m: any) => m.organization_id);
        const { data: hierarchyMatch } = await supabaseClient.from("anew_hierarchy").select("id").eq("child_org_id", proposal.organization_id).in("parent_org_id", userOrgIds).maybeSingle();
        if (!hierarchyMatch) {
          throw new Error("Sem permissão para enviar esta proposta");
        }
      }
    }

    // Check if any associated quote is still in draft
    if (proposal.quotes && proposal.quotes.length > 0) {
      const hasDraftQuote = proposal.quotes.some((q: any) => q.estado === 'rascunho');
      if (hasDraftQuote) {
        throw new Error("Não é possível enviar a proposta enquanto existirem orçamentos em rascunho.");
      }
    }

    // Get sender info from anew_users
    let senderName: string | null = null;
    if (userId) {
      const { data: sender } = await supabaseClient
        .from("anew_users")
        .select("display_name")
        .eq("auth_user_id", userId)
        .maybeSingle();
      senderName = sender?.display_name || null;
    }

    const resolvedSmtp = await resolveSmtpForAuthenticatedUser(supabaseClient, {
      authUserId: userId,
      organizationId: proposal.organization_id,
    });

    if (!resolvedSmtp) {
      throw new Error(smtpNotFoundMessage());
    }
    const smtpConfig = resolvedSmtp.smtp;

    // Generate public URL with tracking token
    const baseUrl = Deno.env.get("SITE_URL") || "https://olyvia.lovable.app";
    const publicUrl = `${baseUrl}/proposta/${proposal.public_token}`;
    
    // Build tracking pixel URL
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const trackingPixelUrl = `${supabaseUrl}/functions/v1/track-proposal-view?t=${proposal.tracking_token}`;

    // Generate email HTML with tracking pixel
    const emailSubject = subject || `Proposta: ${proposal.title}`;
    let emailHtml = generateProposalEmailHtml(proposal, publicUrl, message, senderName || undefined);
    
    // Add tracking pixel at the end of the email
    emailHtml = emailHtml.replace('</body>', `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none" alt="" /></body>`);

    // Send the email
    await sendEmailViaSMTP(smtpConfig, { to: toListInput.length ? toListInput : recipient_email, cc: ccList.length ? ccList : undefined, subject: emailSubject, html: emailHtml });

    let trackingOk = true;
    try {
      await supabaseClient.rpc('set_audit_context', { p_user_id: senderAnewUserId, p_source: 'email' });
      await supabaseClient.from("proposal_sends").insert({
        proposal_id,
        organization_id: proposal.organization_id,
        sent_by: senderAnewUserId,
        recipient_email,
        recipient_name: recipient_name || null,
        subject: emailSubject,
        message: ccList.length ? `${message || ""}${message ? "\n\n" : ""}CC: ${ccList.join(", ")}` : (message || null),
        status: "sent",
        channel: "email",
      });

      await supabaseClient.rpc('set_audit_context', { p_user_id: senderAnewUserId, p_source: 'email' });
      await supabaseClient
        .from("proposals")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", proposal_id);

      await supabaseClient.rpc('set_audit_context', { p_user_id: senderAnewUserId, p_source: 'email' });
      await supabaseClient.from("email_logs").insert({
        organization_id: proposal.organization_id,
        entity_id: proposal.entity_id ?? null,
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
      console.error("[send-proposal-email] tracking incomplete", trackErr);
    }

    console.log("Proposal email sent", { ...resolvedSmtp.metadata, to: recipient_email, tracking: trackingOk ? "ok" : "partial" });

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    const safeError = sanitizeSmtpError(error);
    console.error("Error sending proposal email:", safeError);
    return new Response(
      JSON.stringify({ error: safeError }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
