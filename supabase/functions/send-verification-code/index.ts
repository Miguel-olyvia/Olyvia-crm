import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { z } from "npm:zod";

const verificationRequestSchema = z.object({
  proposal_id: z.string(),
  method: z.literal("email"),
  destination: z.string(),
  action: z.enum(["accept", "reject"]),
  rejection_reason_code: z.string().nullable().optional(),
  rejection_notes: z.string().nullable().optional(),
});

const verifyCodeRequestSchema = z.object({
  proposal_id: z.string(),
  code: z.string(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerificationRequest {
  proposal_id: string;
  method: "email";
  destination: string;
  action: "accept" | "reject";
  rejection_reason_code?: string | null;
  rejection_notes?: string | null;
}

interface VerifyCodeRequest {
  proposal_id: string;
  code: string;
}

// Generate 6-digit code
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Get organization SMTP settings
async function getOrgSmtpSettings(supabase: any, organizationId: string) {
  const { data, error } = await supabase
    .from("organization_smtp_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    return null;
  }
  return data;
}

// Send email via SMTP
async function sendEmailViaSMTP(
  smtpConfig: any,
  to: string,
  subject: string,
  html: string
) {
  const client = new SMTPClient({
    connection: {
      hostname: smtpConfig.smtp_host,
      port: smtpConfig.smtp_port,
      tls: smtpConfig.smtp_secure,
      auth: {
        username: smtpConfig.smtp_username,
        password: smtpConfig.smtp_password,
      },
    },
  });

  await client.send({
    from: `${smtpConfig.from_name} <${smtpConfig.from_email}>`,
    to: to,
    subject: subject,
    content: "",
    html: html,
  });

  await client.close();
}

// Generate verification email HTML from template or default
function generateVerificationEmailHtml(
  code: string, 
  proposalTitle: string,
  clientName: string,
  action: "accept" | "reject",
  templateBody?: string
): string {
  if (templateBody) {
    // Use template with variable replacement
    const htmlContent = templateBody
      .replace(/\{\{codigo\}\}/g, code)
      .replace(/\{\{titulo_proposta\}\}/g, proposalTitle)
      .replace(/\{\{nome_cliente\}\}/g, clientName)
      .replace(/\{\{acao\}\}/g, action === "accept" ? "aceitar" : "recusar");
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Código de Verificação</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="500" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px;">
              ${htmlContent}
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

  // Default template
  const actionText = action === "accept" ? "aceitar" : "recusar";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Código de Verificação</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="500" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 20px;">Código de Verificação</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px; text-align: center;">
              <p style="color: #374151; font-size: 16px; margin-bottom: 16px;">
                Olá <strong>${clientName}</strong>, para ${actionText} a proposta "<strong>${proposalTitle}</strong>", introduza o seguinte código:
              </p>
              
              <div style="background-color: #f3f4f6; border-radius: 12px; padding: 24px; margin: 24px 0;">
                <p style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #111827; margin: 0;">
                  ${code}
                </p>
              </div>
              
              <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
                Este código expira em 15 minutos.
              </p>
              <p style="color: #9ca3af; font-size: 12px; margin-top: 16px;">
                Se não solicitou este código, pode ignorar este email.
              </p>
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

    const url = new URL(req.url);
    const action = url.pathname.split("/").pop();

    if (action === "verify") {
      // Verify code
      const body = await req.json();
      const parsed = verifyCodeRequestSchema.safeParse(body);
      if (!parsed.success) {
        return new Response(
          JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      const { proposal_id, code } = parsed.data;

      // Find valid code
      const { data: verificationData, error: verifyError } = await supabaseClient
        .from("proposal_verification_codes")
        .select("*")
        .eq("proposal_id", proposal_id)
        .eq("code", code)
        .is("verified_at", null)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (verifyError || !verificationData) {
        return new Response(
          JSON.stringify({ error: "Código inválido ou expirado" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }

      // Mark as verified
      await supabaseClient
        .from("proposal_verification_codes")
        .update({ verified_at: new Date().toISOString() })
        .eq("id", verificationData.id);

      // Check if it's accept or reject action
      const pendingAction = verificationData.action || "accept";
      
      if (pendingAction === "accept") {
        // Accept the proposal
        await supabaseClient
          .from("proposals")
          .update({
            status: "accepted",
            accepted_at: new Date().toISOString(),
            acceptance_ip: req.headers.get("x-forwarded-for") || "unknown",
            acceptance_user_agent: req.headers.get("user-agent") || "unknown",
          })
          .eq("id", proposal_id);

        return new Response(
          JSON.stringify({ success: true, message: "Proposta aceite com sucesso", action: "accept" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      } else {
        // Reject the proposal
        await supabaseClient
          .from("proposals")
          .update({
            status: "rejected",
            rejected_at: new Date().toISOString(),
            rejection_reason_code: verificationData.rejection_reason_code,
            rejection_reason: verificationData.rejection_reason,
            rejection_notes: verificationData.rejection_notes,
          })
          .eq("id", proposal_id);

        return new Response(
          JSON.stringify({ success: true, message: "Proposta recusada", action: "reject" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }
    } else {
      // Send verification code
      const body = await req.json();
      const parsed = verificationRequestSchema.safeParse(body);
      if (!parsed.success) {
        return new Response(
          JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      const { proposal_id, method, destination, action, rejection_reason_code, rejection_notes } = parsed.data;

      // Get proposal with template
      const { data: proposal, error: proposalError } = await supabaseClient
        .from("proposals")
        .select("*, proposal_templates(*)")
        .eq("id", proposal_id)
        .single();

      if (proposalError || !proposal) {
        throw new Error("Proposal not found");
      }

      // Get rejection reason label if rejecting
      let rejectionReasonLabel: string | null = null;
      if (action === "reject" && rejection_reason_code) {
        const { data: reasonData } = await supabaseClient
          .from("proposal_rejection_reasons")
          .select("label")
          .eq("organization_id", proposal.organization_id)
          .eq("code", rejection_reason_code)
          .single();
        rejectionReasonLabel = reasonData?.label || null;
      }

      // Generate code
      const code = generateCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Save verification code with action info
      await supabaseClient.from("proposal_verification_codes").insert({
        proposal_id,
        code,
        method,
        destination,
        expires_at: expiresAt.toISOString(),
        action: action || "accept",
        rejection_reason_code: rejection_reason_code || null,
        rejection_reason: rejectionReasonLabel,
        rejection_notes: rejection_notes || null,
      });

      // Get organization SMTP
      const smtpConfig = await getOrgSmtpSettings(supabaseClient, proposal.organization_id);

      if (!smtpConfig) {
        throw new Error("Configuração SMTP não encontrada");
      }

      // Get client name from entity if available
      const clientName = "Cliente";

      // Get template body if available
      const templateBody = proposal.proposal_templates?.verification_email_body || null;
      const emailSubject = proposal.proposal_templates?.verification_email_subject 
        ? proposal.proposal_templates.verification_email_subject
            .replace(/\{\{titulo_proposta\}\}/g, proposal.title)
        : `Código de Verificação - ${action === "accept" ? "Aceitar" : "Recusar"} Proposta`;

      // Send email
      const emailHtml = generateVerificationEmailHtml(
        code, 
        proposal.title, 
        clientName, 
        action || "accept",
        templateBody
      );
      
      await sendEmailViaSMTP(
        smtpConfig,
        destination,
        emailSubject,
        emailHtml
      );

      console.log("Verification code sent via email to:", destination, "for action:", action);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Código enviado para o seu email"
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }
  } catch (error: any) {
    console.error("Error in verification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
