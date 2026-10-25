// create-lead: primeiro passo do formulario publico.
//
// O formulario SO cria a ENTIDADE (anew_entities, sem negocio): lead e a
// entidade sem client_since. Cada envio e um toque novo em form_submissions.
// A logica de captacao vive em `_shared/formCaptacao.ts` (testavel no vitest);
// este ficheiro valida o pedido e responde.
//
// ATENCAO: depende da migration 20261229100000_form_criar_entidade.sql (so
// base de RH). Entra JUNTO com update-lead, insert-lead, get-form-data,
// book-slot, get-scheduling-invite, scheduling-invite-optout, formEmails,
// formCaptacao e PublicLeadForm. NAO publicar na base principal (Mudelar).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { z } from "npm:zod";
import { sanitizeTracking } from '../_shared/leadTracking.ts';
import { sendLeadConfirmationEmail, queueSchedulingInviteRecovery } from '../_shared/formEmails.ts';
import { composeDisplayName } from '../_shared/composeDisplayName.ts';
import { deriveKeyFromEnv, hashNif } from '../_shared/nifCrypto.ts';
import { sanitizeFieldValues } from '../_shared/inputSanitizers.ts';
import { validateLocationDistrict } from '../_shared/leadsValidation.ts';
import {
  captarEnvio,
  lerCamposContacto,
  normalizarNomesNosCampos,
  pickOrigemTexto,
  resolverCaptacao,
  verificarCamposUnicos,
} from '../_shared/formCaptacao.ts';
import { lerConfiguracaoFormulario } from '../_shared/formConfig.ts';
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, getClientIp, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";

initSentry();

const requestSchema = z.object({
  // Opcional: a campanha e so atribuicao. Sem campanha (ou com uma pausada,
  // fora de datas ou de outra organizacao) o envio segue na mesma, sem campanha.
  campaign_id: z.string().uuid().optional(),
  form_id: z.string().uuid().optional(),
  business_unit_id: z.string().uuid().optional(),
  step_number: z.number().optional(),
  field_values: z.record(z.unknown()).optional(),
  source: z.string().optional(),
  // Nullable: o PublicLeadForm envia `source_id: resolvedSourceId || null`.
  source_id: z.string().uuid().optional().nullable(),
  sourceId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  from_chat_widget: z.boolean().optional(),
  tracking: z.record(z.unknown()).optional(),
  embed: z.string().optional(),
  needs_manual_scheduling: z.boolean().optional(),
  lang: z.string().optional(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
};

const RATE_LIMIT_BUCKET = 'create-lead';
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MINUTES = 1;
const MAX_FIELD_VALUE_LENGTH = 10_000;
const ALLOWED_EMBED_KINDS = new Set(['popup', 'inline', 'widget', 'utm', 'chat', '']);

function validateFieldValues(field_values: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(field_values)) {
    if (key === '_meta') continue;
    if (typeof value === 'string' && value.length > MAX_FIELD_VALUE_LENGTH) {
      return `Field "${key}" exceeds maximum length of ${MAX_FIELD_VALUE_LENGTH} characters`;
    }
  }
  return null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Public Lead Creation API (Multi-Step Support). PUBLIC endpoint (sem sessao).
 *
 * Obrigatorio: form_id ou campaign_id (so como validacao do pedido; quem
 * decide a organizacao e a base, nunca o cliente).
 *
 * Resposta: lead_id e target_id = id da submissao NOVA (chave de continuacao
 * do update-lead), igual para ficha nova e ficha conhecida (privacidade: quem
 * esta fora nao sabe se a pessoa ja existia). Nunca expoe entity_id.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed. Use POST.' }, 405);

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Rate limiting persistente (base de dados).
    const clientIp = getClientIp(req);
    const rateLimit = await checkRateLimit(supabase, {
      bucket: RATE_LIMIT_BUCKET,
      identifier: clientIp,
      maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
      windowMinutes: RATE_LIMIT_WINDOW_MINUTES,
    });
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit, corsHeaders);
    await recordRateLimitAttempt(supabase, RATE_LIMIT_BUCKET, clientIp);

    const parsedBody = requestSchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return json({ error: 'Invalid request', details: parsedBody.error.issues }, 400);
    }
    // SEGURANCA: a organizacao nunca vem do corpo; vem do formulario/campanha na base.
    const {
      campaign_id, form_id, business_unit_id, step_number, field_values, source, notes,
      from_chat_widget, tracking, embed, needs_manual_scheduling, lang,
    } = parsedBody.data;
    const leadLocale = (typeof lang === 'string' && lang.trim()) ? lang.trim().toLowerCase() : null;
    const incomingSourceId: string | null = parsedBody.data.source_id ?? parsedBody.data.sourceId ?? null;
    const rawEmbedKind = typeof embed === 'string' ? embed.trim().toLowerCase() : '';
    const embedKind = ALLOWED_EMBED_KINDS.has(rawEmbedKind) ? rawEmbedKind : '';

    // Log sem dados pessoais.
    console.log('Received lead request:', JSON.stringify({
      campaign_id, form_id, step_number, source,
      from_chat_widget, field_count: Object.keys(field_values || {}).length,
    }));

    if (!campaign_id && !form_id) return json({ error: 'campaign_id or form_id is required' }, 400);
    if (!field_values || typeof field_values !== 'object') {
      return json({ error: 'field_values object is required' }, 400);
    }
    const fieldValidationError = validateFieldValues(field_values);
    if (fieldValidationError) return json({ error: fieldValidationError }, 400);

    const safeTracking = sanitizeTracking(tracking);
    const origemTexto = pickOrigemTexto({ embedKind, tracking: safeTracking, source: source ?? null });

    // Organizacao, formulario e campanha validos: decididos pela base. Aborta
    // aqui, antes de qualquer escrita, se o formulario nao existir.
    const resolvido = await resolverCaptacao(supabase, {
      formId: form_id ?? null,
      campaignId: campaign_id ?? null,
      origemTexto,
      originId: incomingSourceId,
    });
    if (!resolvido.ok) return json({ error: resolvido.error }, resolvido.status);
    const { organizationId, formId, campaignId } = resolvido;

    // Passos e campos: do formulario; so sem formulario, da campanha.
    let totalSteps = 1;
    let definitions: any[] = [];
    let formLocationRequired = false;
    let formName: string | null = null;

    if (formId) {
      // Leitura falhada = 503 RETRY antes de qualquer escrita (nunca totalSteps
      // a 1 nem campos vazios por omissao).
      const config = await lerConfiguracaoFormulario({
        supabase,
        formId,
        organizationId,
        formSelect: 'name, location_required',
        fieldsSelect: '*, step_number, field_key, field_label, is_required, is_unique, is_active',
        ordenarCampos: true,
        totalStepsOmissao: 1,
      });
      if (!config.ok) return json({ error: config.error, code: config.code }, config.status);
      formLocationRequired = !!config.formRow?.location_required;
      formName = config.formRow?.name ?? null;
      totalSteps = config.totalSteps;
      definitions = config.definitions;
    } else if (campaignId) {
      const { data: stepsData } = await supabase
        .from('campaign_form_steps')
        .select('step_number')
        .eq('campaign_id', campaignId)
        .order('step_number', { ascending: false })
        .limit(1);
      totalSteps = stepsData?.[0]?.step_number || 1;

      const { data: fieldDefs, error: fieldDefsError } = await supabase
        .from('lead_field_definitions')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('is_active', true)
        .order('sort_order');
      if (fieldDefsError) console.error('Error fetching field definitions:', fieldDefsError);
      definitions = fieldDefs || [];
    }

    // Sanitizacao defensiva ANTES de qualquer persistencia ou validacao.
    const contactMap: Record<string, string> = {};
    for (const def of definitions) {
      if (def.contact_field_mapping && def.field_key) contactMap[def.contact_field_mapping] = def.field_key;
    }
    const sanitizeResult = sanitizeFieldValues(field_values, contactMap);
    const sanitizeReport = sanitizeResult.report;
    if (sanitizeReport.email_rejected) {
      console.warn(`[create-lead] rejected invalid email "${sanitizeReport.email_rejected}"`);
    }
    if (sanitizeReport.phone_rejected) {
      console.warn(`[create-lead] rejected invalid phone "${sanitizeReport.phone_rejected}"`);
    }
    const cleanedValues = normalizarNomesNosCampos({ ...field_values, ...sanitizeResult.cleaned }, definitions);

    let currentStep = step_number || 1;
    const stepsCompleted: number[] = [];

    if (from_chat_widget) {
      for (let step = 1; step <= totalSteps; step++) {
        const stepFields = definitions.filter((d: any) => d.step_number === step);
        const allRequiredFilled = stepFields
          .filter((d: any) => d.is_required)
          .every((d: any) => cleanedValues[d.field_key]);
        if (allRequiredFilled || stepFields.length === 0) stepsCompleted.push(step);
      }
      currentStep = stepsCompleted.length === totalSteps ? totalSteps : Math.max(...stepsCompleted, 1);
    } else {
      const missingRequired: string[] = [];
      for (const def of definitions.filter((d: any) => d.step_number === currentStep)) {
        if (def.is_required && !cleanedValues[def.field_key]) missingRequired.push(def.field_label);
      }
      if (missingRequired.length > 0) {
        return json({
          error: `Missing required fields: ${missingRequired.join(', ')}`,
          missing_fields: missingRequired,
        }, 400);
      }
    }

    // Campos unicos: contra os envios (form_submissions) do mesmo formulario e organizacao.
    const duplicado = await verificarCamposUnicos({
      supabase, organizationId, formId, definitions, fieldValues: cleanedValues,
    });
    if (duplicado) {
      return json({
        error: `A lead with this ${duplicado.fieldLabel} already exists`,
        duplicate_field: duplicado.fieldKey,
        duplicate_value: duplicado.value,
      }, 409);
    }

    // Distrito: server-side, so por form_districts (a campanha ja nao decide).
    const locationValidation = await validateLocationDistrict({
      supabase,
      campaignId: null,
      campaignLocationRequired: false,
      formId,
      formLocationRequired,
      definitions,
      fieldValues: cleanedValues,
    });
    if (!locationValidation.ok) return json({ error: locationValidation.error }, 400);

    if (business_unit_id) {
      const { data: bu, error: buError } = await supabase
        .from('anew_organizations')
        .select('id, type')
        .eq('id', business_unit_id)
        .single();
      if (buError || !bu) return json({ error: 'Business unit not found' }, 404);
      const { data: hierarchyCheck } = await supabase
        .from('anew_hierarchy')
        .select('id')
        .eq('parent_org_id', organizationId)
        .eq('child_org_id', business_unit_id)
        .maybeSingle();
      if (!hierarchyCheck) {
        return json({ error: 'Business unit does not belong to the specified organization' }, 400);
      }
    }

    const isComplete = currentStep >= totalSteps;
    const fieldValuesWithMeta: Record<string, any> = {
      ...cleanedValues,
      _meta: {
        current_step: currentStep,
        total_steps: totalSteps,
        is_complete: isComplete,
        steps_completed: from_chat_widget ? stepsCompleted : [currentStep],
        last_updated: new Date().toISOString(),
        ...(safeTracking ? { tracking: safeTracking } : {}),
      },
    };

    // Hash do NIF (best-effort): o NIF em claro nunca chega a pesquisa.
    let nifHash: string | null = null;
    const { rawVat } = lerCamposContacto(cleanedValues, definitions);
    if (rawVat) {
      try {
        nifHash = await hashNif(rawVat, deriveKeyFromEnv('NIF_HMAC_KEY', 'HMAC'));
      } catch (hashError) {
        console.error('[create-lead] failed to hash NIF for entity lookup:', hashError instanceof Error ? hashError.message : hashError);
      }
    }

    const envio = await captarEnvio({
      supabase,
      resolvido,
      formId,
      campaignId,
      origemTexto,
      originId: incomingSourceId,
      fieldValues: fieldValuesWithMeta,
      definitions,
      currentStep,
      totalSteps,
      isComplete,
      locale: leadLocale,
      notes: notes ?? null,
      needsManualScheduling: !!needs_manual_scheduling,
      formName,
      nifHash,
    });
    if (!envio.ok) return json(envio.code ? { error: envio.error, code: envio.code } : { error: envio.error }, envio.status);

    // Emails de conclusao: so para ficha NOVA. Para uma ficha conhecida nao se
    // envia nada, senao um terceiro podia encher de emails a caixa de outra pessoa.
    if (envio.created && isComplete && envio.formId && envio.email) {
      try {
        const { data: schedulingStep } = await supabase
          .from('form_steps')
          .select('id')
          .eq('form_id', envio.formId)
          .eq('step_type', 'scheduling')
          .limit(1)
          .maybeSingle();
        const leadName = composeDisplayName(envio.firstName, envio.lastName) || '';
        if (!schedulingStep) {
          await sendLeadConfirmationEmail(supabase, {
            organizationId: envio.organizationId,
            formId: envio.formId,
            leadEmail: envio.email,
            leadName,
            leadPhone: envio.contactos.phone,
            leadLocale,
          });
        } else if (needs_manual_scheduling) {
          await queueSchedulingInviteRecovery(supabase, {
            organizationId: envio.organizationId,
            formId: envio.formId,
            entityId: envio.entityId,
            submissionId: envio.submissionId,
            leadName,
            leadEmail: envio.email,
            leadLocale,
            fieldValues: fieldValuesWithMeta,
            needsManualScheduling: true,
          });
        }
      } catch (emailErr) {
        console.error('[create-lead] post-completion email failed (non-fatal):', emailErr);
      }
    }

    return json({
      success: true,
      lead_id: envio.submissionId,
      target_type: 'lead',
      target_id: envio.submissionId,
      current_step: currentStep,
      total_steps: totalSteps,
      is_complete: isComplete,
      next_step: isComplete ? null : currentStep + 1,
      sanitized: sanitizeReport,
      message: isComplete ? 'Lead created successfully' : `Step ${currentStep} completed. Continue with update-lead API.`,
    }, 201);
  } catch (error: any) {
    console.error('Error in create-lead:', error);
    await captureError(error, { function: "create-lead" });
    return json({ error: 'Internal server error' }, 500);
  }
});
