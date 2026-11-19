import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { resolveProposalStageId } from "../_shared/proposalWorkflowStage.ts";
import { detectClientIp, detectUserAgent } from "../_shared/clientIp.ts";
import { checkRateLimit, recordRateLimitAttempt, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";
import { buildVerificationMail } from "../_shared/documentMails.ts";
import { mailLangsOf, proposalLanguages } from "../_shared/documentLanguage.ts";

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
      const { proposal_id, code }: VerifyCodeRequest = await req.json();

      if (!proposal_id || !code) {
        throw new Error("Missing required fields: proposal_id, code");
      }

      // Rate limit (a8): trava a forca-bruta do codigo de 6 digitos.
      const ipVer = getClientIp(req);
      const rlVer = await checkRateLimit(supabaseClient, {
        bucket: "send-verification-code:verify",
        identifier: `${ipVer}:${proposal_id}`,
        maxAttempts: 5,
        windowMinutes: 15,
      });
      if (!rlVer.allowed) return rateLimitResponse(rlVer, corsHeaders);
      await recordRateLimitAttempt(supabaseClient, "send-verification-code:verify", `${ipVer}:${proposal_id}`);

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
        const { data: proposalRow } = await supabaseClient
          .from("proposals")
          .select("organization_id")
          .eq("id", proposal_id)
          .maybeSingle();
        const acceptedStageId = await resolveProposalStageId(supabaseClient, proposalRow?.organization_id, "is_won");

        await supabaseClient
          .from("proposals")
          .update({
            status: "accepted",
            accepted_at: new Date().toISOString(),
            // NUNCA "unknown": um placeholder num campo de prova e
            // indistinguivel de uma deteccao real. Ausente => NULL.
            // O header cru e uma cadeia "cliente, proxy1, proxy2" — nao um IP.
            acceptance_ip: detectClientIp(req),
            acceptance_user_agent: detectUserAgent(req),
            ...(acceptedStageId ? { stage_id: acceptedStageId } : {}),
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
        // Rejeitar a proposta atomicamente (com cascata condicional a deal/lead)
        const { error: rpcError } = await supabaseClient.rpc("reject_proposal_atomic", {
          p_proposal_id:           proposal_id,
          p_public_token:          null, // autorizado por verificacao de codigo acima
          p_rejection_reason_code: verificationData.rejection_reason_code || null,
          p_rejection_reason:      verificationData.rejection_reason || null,
          p_rejection_notes:       verificationData.rejection_notes || null,
        });
        if (rpcError) console.error("[send-verification-code] reject_proposal_atomic error:", rpcError);

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
      const { proposal_id, method, destination, action, rejection_reason_code, rejection_notes }: VerificationRequest = await req.json();

      if (!proposal_id || !method || !destination) {
        throw new Error("Missing required fields: proposal_id, method, destination");
      }

      // Get proposal with template
      const { data: proposal, error: proposalError } = await supabaseClient
        .from("proposals")
        .select("*, proposal_templates(*)")
        .eq("id", proposal_id)
        .single();

      if (proposalError || !proposal) {
        throw new Error("Proposal not found");
      }

      // Rate limit (a8): trava spam de envio pelo SMTP do cliente e escrita ilimitada.
      const ipSend = getClientIp(req);
      const rlSend = await checkRateLimit(supabaseClient, {
        bucket: "send-verification-code",
        identifier: `${ipSend}:${proposal_id}`,
        maxAttempts: 3,
        windowMinutes: 15,
      });
      if (!rlSend.allowed) return rateLimitResponse(rlSend, corsHeaders);
      await recordRateLimitAttempt(supabaseClient, "send-verification-code", `${ipSend}:${proposal_id}`);

      // SEGURANCA (a1): o destinatario do codigo e resolvido no SERVIDOR, a partir
      // do email primario da ficha da proposta -- NUNCA o "destination" do corpo,
      // que o chamador controla. Sem isto, qualquer um que abrisse o link publico
      // punha o seu proprio email, recebia o OTP e aceitava/recusava a proposta.
      // Email principal mais recente da ficha (editar a ficha nao desmarca os
      // principais antigos; sem ordem saia um qualquer, as vezes o da pessoa
      // anterior). Sem principal, o mais recente. Continua a ser sempre um
      // email da propria ficha da proposta.
      const { data: primaryEmail } = await supabaseClient
        .from("anew_entity_emails")
        .select("email")
        .eq("entity_id", proposal.entity_id)
        .order("is_primary", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      const recipient = (primaryEmail?.email || "").trim();
      if (!recipient) {
        return new Response(
          JSON.stringify({ error: "no_contact", message: "A proposta nao tem email de contacto na ficha." }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // Se o corpo indicar um destino, tem de ser exactamente o da ficha.
      if (destination && destination.trim().toLowerCase() !== recipient.toLowerCase()) {
        return new Response(
          JSON.stringify({ error: "email_mismatch", message: "O email indicado nao corresponde ao contacto da proposta." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
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
        destination: recipient,
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

      // Texto do email: a copia congelada da proposta manda sobre o modelo vivo, pela mesma
      // razao que o PDF e o portal: editar o modelo partilhado nao deve mudar o que e mandado
      // a proposito de uma proposta ja enviada. O idioma e o da proposta (proposals.language;
      // nulo = pt): assunto e corpo vem da versao desse idioma no modelo (design_settings.versions),
      // com fallback ao texto base e depois ao texto por omissao.
      const emailTemplate = proposal.template_snapshot || proposal.proposal_templates;
      const verificationMail = buildVerificationMail({
        code,
        proposalTitle: proposal.title,
        action,
        template: emailTemplate,
        langs: mailLangsOf(proposalLanguages(proposal)),
      });
      const emailSubject = verificationMail.subject;
      const emailHtml = verificationMail.html;

      // Send email
      await sendEmailViaSMTP(
        smtpConfig,
        recipient,
        emailSubject,
        emailHtml
      );

      console.log("Verification code sent via email to:", recipient, "for action:", action);

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
