import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireServiceRole } from "../_shared/auth.ts";
import { isNotificationEnabled } from "../_shared/notificationSettings.ts";
import { resolveSmtpForScheduledEmail, sanitizeSmtpError } from "../_shared/smtp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!requireServiceRole(req)) {
    return new Response(
      JSON.stringify({ error: "This endpoint is for internal use only" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: pendingEmails, error: fetchError } = await supabase
      .from("scheduled_emails")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .limit(50);

    if (fetchError) throw fetchError;
    if (!pendingEmails || pendingEmails.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /** Helper: insert notification only if enabled */
    async function maybeNotify(userId: string, orgId: string | null, type: string, payload: Record<string, any>) {
      const enabled = await isNotificationEnabled(supabase, orgId, type);
      if (!enabled) return;
      await supabase.from("notifications").insert({
        user_id: userId,
        type,
        kind: "notification",
        ...payload,
      });
    }

    let processed = 0;
    let cancelled = 0;
    let failed = 0;
    const smtpResolutionSummary = {
      smtp_resolved_by_auth_user_id_direct: 0,
      smtp_resolved_by_anew_user_id_fallback: 0,
      smtp_resolved_by_organization_fallback: 0,
      smtp_not_found: 0,
    };

    for (const email of pendingEmails) {
      try {
        const shouldCancel = await checkIfShouldCancel(supabase, email);
        if (shouldCancel) {
          await supabase.from("scheduled_emails").update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancel_reason: "Estado da entidade mudou antes do envio agendado",
          }).eq("id", email.id);
          cancelled++;
          continue;
        }

        const resolvedSmtp = await resolveSmtpForScheduledEmail(supabase, {
          scheduledUserId: email.user_id,
          organizationId: email.organization_id,
        });

        if (resolvedSmtp?.resolution_mode === "auth_user_id_direct") smtpResolutionSummary.smtp_resolved_by_auth_user_id_direct++;
        else if (resolvedSmtp?.resolution_mode === "anew_user_id_fallback") smtpResolutionSummary.smtp_resolved_by_anew_user_id_fallback++;
        else if (resolvedSmtp?.resolution_mode === "organization_fallback") smtpResolutionSummary.smtp_resolved_by_organization_fallback++;
        else smtpResolutionSummary.smtp_not_found++;

        if (!resolvedSmtp) {
          const safeError = "Nenhum SMTP ativo encontrado para o utilizador nem para a organização.";
          await maybeNotify(email.user_id, email.organization_id, "email_error", {
            title: "❌ Email agendado não enviado",
            message: `Não foi possível enviar o email "${email.subject}" — ${safeError}`,
            data: { scheduled_email_id: email.id, entity_type: email.entity_type, entity_id: email.entity_id },
          });
          await supabase.from("scheduled_emails").update({
            status: "failed",
            error_message: safeError,
          }).eq("id", email.id);
          failed++;
          continue;
        }

        const sendResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              user_id: email.user_id,
              organization_id: email.organization_id,
              to: email.to_email,
              subject: email.subject,
              html: email.body_html,
            }),
          }
        );

        const sendResult = await sendResponse.json();
        if (sendResult.error) throw new Error(sendResult.error);

        await supabase.from("scheduled_emails").update({
          status: "sent",
          sent_at: new Date().toISOString(),
        }).eq("id", email.id);

        await maybeNotify(email.user_id, email.organization_id, "email_sent", {
          title: "✉️ Email automático enviado",
          message: `"${email.subject}" → ${email.to_email}`,
          data: { scheduled_email_id: email.id, entity_type: email.entity_type, entity_id: email.entity_id },
        });

        processed++;
      } catch (err: any) {
        const safeError = sanitizeSmtpError(err);
        console.error(`Error processing scheduled email ${email.id}:`, safeError);
        await supabase.from("scheduled_emails").update({
          status: "failed",
          error_message: safeError,
        }).eq("id", email.id);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ processed, cancelled, failed, ...smtpResolutionSummary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    const safeError = sanitizeSmtpError(error);
    console.error("Error in process-scheduled-emails:", safeError);
    return new Response(
      JSON.stringify({ error: safeError }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function checkIfShouldCancel(supabase: any, email: any): Promise<boolean> {
  if (!email.template_id) return false;

  const { data: template } = await supabase
    .from("email_templates")
    .select("trigger_phase, module")
    .eq("id", email.template_id)
    .maybeSingle();

  if (!template || !template.trigger_phase) return false;

  const { entity_type, entity_id } = email;

  if (entity_type === "proposals") {
    const { data: proposal } = await supabase.from("proposals").select("stage_id").eq("id", entity_id).maybeSingle();
    if (!proposal) return true;
    if (proposal.stage_id) {
      const { data: stage } = await supabase.from("proposal_workflow_stages").select("name").eq("id", proposal.stage_id).maybeSingle();
      if (stage?.name && stage.name !== template.trigger_phase) return true;
    }
  } else if (entity_type === "quotes") {
    const { data: quote } = await supabase.from("quotes").select("estado").eq("id", entity_id).maybeSingle();
    if (!quote) return true;
    if (quote.estado !== template.trigger_phase) return true;
  } else if (entity_type === "leads") {
    const { data: lead } = await supabase.from("anew_leads").select("workflow_stage_id").eq("id", entity_id).maybeSingle();
    if (!lead) return true;
    if (lead.workflow_stage_id) {
      const { data: stage } = await supabase.from("lead_workflow_stages").select("name").eq("id", lead.workflow_stage_id).maybeSingle();
      if (stage?.name && stage.name !== template.trigger_phase) return true;
    }
  } else if (entity_type === "contracts") {
    const { data: contract } = await supabase.from("client_contracts").select("status").eq("id", entity_id).maybeSingle();
    if (!contract) return true;
    if (contract.status !== template.trigger_phase) return true;
  }

  return false;
}
