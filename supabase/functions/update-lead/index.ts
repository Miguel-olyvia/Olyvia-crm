// update-lead: passos 2 a N do formulario publico.
//
// A chave de continuacao e SEMPRE o id de uma linha de form_submissions (o que
// o create-lead devolve em lead_id/target_id). Esta funcao nunca le nem
// escreve anew_leads. Quando a submissao criou a entidade (marca
// `_meta.entidade_nova`, escrita so pelo servidor), o nome e a morada deste
// passo completam a entidade pela base (fn_form_completar_entidade); numa
// entidade que ja existia nada se escreve na ficha.
//
// ATENCAO: depende da migration 20261229100000_form_criar_entidade.sql (so
// base de RH). Entra JUNTO com create-lead, insert-lead, get-form-data,
// book-slot e formEmails. NAO publicar na base principal sem autorizacao.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { z } from "npm:zod";
import { sanitizeTracking } from "../_shared/leadTracking.ts";
import { lerConfiguracaoFormulario } from "../_shared/formConfig.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, getClientIp, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { composeDisplayName } from "../_shared/composeDisplayName.ts";
import { sanitizeFieldValues } from "../_shared/inputSanitizers.ts";
import { sendLeadConfirmationEmail, queueSchedulingInviteRecovery } from "../_shared/formEmails.ts";
import { validateLocationDistrict } from "../_shared/leadsValidation.ts";
import {
  collectContactos,
  lerCamposContacto,
  verificarCamposUnicos,
} from "../_shared/formCaptacao.ts";
import { completarSeNova, decidirAcesso } from "./acesso.ts";

initSentry();

const requestSchema = z.object({
  lead_id: z.string().uuid().optional(),
  target_type: z.enum(["lead", "contact", "client", "submission"]).optional(),
  target_id: z.string().uuid().optional(),
  // Opcional: a campanha e so atribuicao; o acesso decide-se por form_id.
  campaign_id: z.string().uuid().optional(),
  step_number: z.number().optional(),
  field_values: z.record(z.unknown()),
  from_chat_widget: z.boolean().optional(),
  form_id: z.string().uuid().optional(),
  tracking: z.record(z.unknown()).optional(),
  needs_manual_scheduling: z.boolean().optional(),
  lang: z.string().optional(),
}).refine(
  (v) => !!v.lead_id || !!v.target_id,
  { message: "Either lead_id or target_id must be provided" },
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
};

const RATE_LIMIT_BUCKET = "update-lead";
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MINUTES = 1;
const MAX_FIELD_VALUE_LENGTH = 10_000;

function validateFieldValues(field_values: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(field_values)) {
    if (key === "_meta") continue;
    if (typeof value === "string" && value.length > MAX_FIELD_VALUE_LENGTH) {
      return `Field "${key}" exceeds maximum length of ${MAX_FIELD_VALUE_LENGTH} characters`;
    }
  }
  return null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "PATCH" && req.method !== "POST") {
    return json({ error: "Method not allowed. Use PATCH or POST" }, 405);
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const clientIp = getClientIp(req);
    const rateLimit = await checkRateLimit(supabase, {
      bucket: RATE_LIMIT_BUCKET,
      identifier: clientIp,
      maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
      windowMinutes: RATE_LIMIT_WINDOW_MINUTES,
    });
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit, corsHeaders);
    await recordRateLimitAttempt(supabase, RATE_LIMIT_BUCKET, clientIp);

    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: "Invalid request", details: parsed.error.issues }, 400);
    const {
      lead_id, campaign_id, step_number, field_values, from_chat_widget, form_id,
      tracking, needs_manual_scheduling, lang,
    } = parsed.data;
    const leadLocale = (typeof lang === "string" && lang.trim()) ? lang.trim().toLowerCase() : null;
    const targetId = parsed.data.target_id ?? lead_id ?? null;
    if (!targetId) return json({ error: "Either lead_id or target_id must be provided" }, 400);

    console.log("Received update-lead request:", JSON.stringify({
      target_id: targetId, form_id, campaign_id, step_number, from_chat_widget,
      field_count: Object.keys(field_values || {}).length,
    }));

    const fieldValidationError = validateFieldValues(field_values);
    if (fieldValidationError) return json({ error: fieldValidationError }, 400);

    // A continuacao resolve-se pelo proprio id da submissao (um UUID que nao
    // revela nada). O rotulo target_type nao e de confiar.
    const { data: existingSubmission, error: submissionError } = await supabase
      .from("form_submissions")
      .select("*")
      .eq("id", targetId)
      .maybeSingle();
    if (submissionError || !existingSubmission) {
      if (submissionError) console.error("form_submissions lookup failed:", submissionError.message);
      return json({ error: "Form submission not found" }, 404);
    }

    const acesso = decidirAcesso({
      submission: existingSubmission,
      formId: form_id ?? null,
      campaignId: campaign_id ?? null,
    });
    if (!acesso.ok) {
      console.warn("update-lead access refused:", JSON.stringify({ target_id: targetId, status: acesso.status }));
      return json({ error: acesso.error }, acesso.status);
    }

    // Toda a consulta daqui para a frente leva a organizacao da submissao.
    const organizationId: string = existingSubmission.organization_id;
    const formId = acesso.formId;
    const campaignId: string | null = existingSubmission.campaign_id ?? null;

    let definitions: any[] = [];
    let totalSteps = existingSubmission.total_steps || 1;
    let formLocationRequired = false;

    if (formId) {
      // Leitura falhada = 503 RETRY antes de qualquer escrita (nunca campos
      // vazios nem distrito por validar por omissao).
      const config = await lerConfiguracaoFormulario({
        supabase,
        formId,
        organizationId,
        formSelect: "location_required",
        fieldsSelect: "*",
        ordenarCampos: false,
        totalStepsOmissao: totalSteps,
      });
      if (!config.ok) return json({ error: config.error, code: config.code }, config.status);
      formLocationRequired = !!config.formRow?.location_required;
      definitions = config.definitions;
      totalSteps = config.totalSteps;
    } else if (campaignId) {
      // So corre havendo campanha (formulario antigo definido na campanha).
      const { data: fieldDefs } = await supabase
        .from("lead_field_definitions")
        .select("*")
        .eq("campaign_id", campaignId)
        .eq("is_active", true);
      definitions = fieldDefs || [];

      const { data: totalStepsData } = await supabase
        .from("campaign_form_steps")
        .select("step_number")
        .eq("campaign_id", campaignId)
        .order("step_number", { ascending: false })
        .limit(1);
      totalSteps = totalStepsData?.[0]?.step_number || totalSteps;
    }

    // Sanitizacao defensiva ANTES de validar ou juntar.
    const contactMap: Record<string, string> = {};
    for (const def of definitions) {
      if (def.contact_field_mapping && def.field_key) contactMap[def.contact_field_mapping] = def.field_key;
    }
    const sanitizeResult = sanitizeFieldValues(field_values, contactMap);
    const sanitizeReport = sanitizeResult.report;
    if (sanitizeReport.email_rejected) {
      console.warn(`[update-lead] rejected invalid email "${sanitizeReport.email_rejected}"`);
    }
    if (sanitizeReport.phone_rejected) {
      console.warn(`[update-lead] rejected invalid phone "${sanitizeReport.phone_rejected}"`);
    }
    // `_meta` nunca vem do cliente: o servidor repoe-o abaixo.
    const { _meta: _ignoredClientMeta, ...incoming } = { ...field_values, ...sanitizeResult.cleaned };

    const currentStep = step_number || (existingSubmission.current_step || 0) + 1;
    const currentStepFields = definitions.filter((f: any) => f.step_number === currentStep);

    if (!from_chat_widget) {
      const missingRequired: string[] = [];
      for (const field of currentStepFields) {
        if (field.is_required && !incoming[field.field_key]) missingRequired.push(field.field_label);
      }
      if (missingRequired.length > 0) {
        return json({ error: "Missing required fields", missing_fields: missingRequired }, 400);
      }
    }

    // Campos unicos deste passo: contra os envios do mesmo formulario, sem esta.
    const duplicado = await verificarCamposUnicos({
      supabase,
      organizationId,
      formId,
      definitions: currentStepFields,
      fieldValues: incoming,
      excludeSubmissionId: targetId,
    });
    if (duplicado) {
      return json({
        error: `Duplicate value for unique field: ${duplicado.fieldLabel}`,
        field_key: duplicado.fieldKey,
      }, 409);
    }

    const locationValidation = await validateLocationDistrict({
      supabase,
      campaignId: null,
      campaignLocationRequired: false,
      formId,
      formLocationRequired,
      definitions,
      fieldValues: incoming,
    });
    if (!locationValidation.ok) return json({ error: locationValidation.error }, 400);

    const isComplete = currentStep >= totalSteps;
    const { _meta: existingMeta, ...existingFields } = existingSubmission.field_values || {};
    const safeTracking = sanitizeTracking(tracking);
    const preservedTracking = existingMeta?.tracking ? existingMeta.tracking : (safeTracking || undefined);

    const updatedFieldValues = {
      ...existingFields,
      ...incoming,
      _meta: {
        ...existingMeta,
        current_step: currentStep,
        total_steps: totalSteps,
        is_complete: isComplete,
        last_updated: new Date().toISOString(),
        steps_completed: [...(existingMeta?.steps_completed || []), currentStep]
          .filter((v: number, i: number, a: number[]) => a.indexOf(v) === i)
          .sort((a: number, b: number) => a - b),
        ...(preservedTracking ? { tracking: preservedTracking } : {}),
      },
    };

    const update: Record<string, unknown> = {
      field_values: updatedFieldValues,
      current_step: currentStep,
      total_steps: totalSteps,
      is_complete: isComplete,
      status: isComplete ? "complete" : "in_progress",
      updated_at: new Date().toISOString(),
    };
    if (typeof needs_manual_scheduling === "boolean") update.needs_manual_scheduling = needs_manual_scheduling;

    const { error: updateError } = await supabase
      .from("form_submissions")
      .update(update)
      .eq("id", targetId)
      .eq("organization_id", organizationId);
    if (updateError) {
      console.error("Error updating form_submissions:", updateError);
      return json({ error: "Error updating form submission" }, 500);
    }

    // Entidade criada por este envio: completa nome e morada (a base valida).
    await completarSeNova({
      supabase,
      submission: existingSubmission,
      fieldValues: incoming,
      definitions,
    });

    // Emails de conclusao: so na ficha NOVA deste envio e uma unica vez, para
    // ninguem poder encher de emails a caixa de outra pessoa.
    const ficaNova = existingMeta?.entidade_nova === true;
    if (isComplete && !existingSubmission.is_complete && ficaNova && formId && existingSubmission.entity_id) {
      try {
        const campos = lerCamposContacto(updatedFieldValues, definitions);
        const contactos = collectContactos(campos.rawEmail, campos.rawPhone);
        if (contactos.email) {
          const leadName = composeDisplayName(campos.firstName, campos.lastName) || "";
          const { data: schedulingStepCheck } = await supabase
            .from("form_steps")
            .select("id")
            .eq("form_id", formId)
            .eq("step_type", "scheduling")
            .limit(1)
            .maybeSingle();
          if (!schedulingStepCheck) {
            await sendLeadConfirmationEmail(supabase, {
              organizationId,
              formId,
              leadEmail: contactos.email,
              leadName,
              leadPhone: contactos.phone,
              leadLocale,
            });
          } else if (needs_manual_scheduling) {
            await queueSchedulingInviteRecovery(supabase, {
              organizationId,
              formId,
              entityId: existingSubmission.entity_id,
              submissionId: targetId,
              leadName,
              leadEmail: contactos.email,
              leadLocale,
              fieldValues: updatedFieldValues,
              needsManualScheduling: true,
            });
          }
        }
      } catch (emailErr) {
        console.error("[update-lead] post-completion email failed (non-fatal):", emailErr);
      }
    }

    return json({
      success: true,
      lead_id: targetId,
      target_type: "lead",
      target_id: targetId,
      current_step: currentStep,
      total_steps: totalSteps,
      is_complete: isComplete,
      next_step: isComplete ? null : currentStep + 1,
      steps_completed: updatedFieldValues._meta.steps_completed,
      sanitized: sanitizeReport,
    }, 200);
  } catch (error: any) {
    console.error("Error in update-lead:", error);
    await captureError(error, { function: "update-lead" });
    return json({ error: "Internal server error" }, 500);
  }
});
