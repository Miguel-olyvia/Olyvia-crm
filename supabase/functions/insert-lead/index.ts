// insert-lead: entrada de leads por API (token com ambito de organizacao).
//
// Usa o mesmo nucleo do formulario publico (`_shared/formCaptacao.ts`): cria
// a ENTIDADE (sem negocio) e grava um toque em form_submissions. A organizacao
// vem do token e e passada ao resolver: formulario/campanha de outra
// organizacao abortam com 403 antes de qualquer escrita; campanha inexistente,
// inativa ou fora de datas ja nao recusa, o envio segue sem campanha.
//
// ATENCAO: depende da migration 20261229100000_form_criar_entidade.sql (so
// base de RH). Entra JUNTO com create-lead, update-lead, get-form-data,
// book-slot e formCaptacao. NAO publicar na base principal sem autorizacao.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { z } from "npm:zod";
import { normalizeFirstLast } from '../_shared/composeDisplayName.ts';
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import { sanitizeFieldValues } from '../_shared/inputSanitizers.ts';
import { validateLocationDistrict } from '../_shared/leadsValidation.ts';
import { captarEnvio, resolverCaptacao } from '../_shared/formCaptacao.ts';
import { deriveKeyFromEnv } from '../_shared/nifCrypto.ts';
import {
  HONEYPOT_CAMPO,
  LIMITE_IMPRESSAO_COM_TOKEN,
  NOME_MAX,
  honeypotPreenchido,
  impressaoDigital,
  validarContactosPublicos,
  verificarLimitesCaptacao,
} from '../_shared/captacaoPublica.ts';
import { montarPedidoAutoSchedule } from './agendamento.ts';

initSentry();

const requestSchema = z.object({
  first_name: z.string().max(NOME_MAX),
  last_name: z.string().max(NOME_MAX),
  email: z.string().email().max(254).optional(),
  phone: z.string().max(50).optional(),
  vat: z.string().optional(),
  position: z.string().optional(),
  organization_id: z.string().optional(),
  notes: z.string().optional(),
  source: z.string().optional(),
  source_id: z.string().uuid().optional(),
  campaign_id: z.string().uuid().optional(),
  status: z.string().optional(),
  custom_fields: z.record(z.string()).optional(),
  auto_schedule: z.boolean().optional(),
  schedule_options: z.record(z.unknown()).optional(),
  location: z.string().optional(),
  address: z.string().optional(),
  postal_code: z.string().optional(),
  city: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  // Honeypot (aceita qualquer tipo; um valor = bot).
  [HONEYPOT_CAMPO]: z.unknown().optional(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

const RATE_LIMIT_BUCKET = 'insert-lead';
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MINUTES = 1;
const MAX_FIELD_LENGTH = 10000;
const DEFAULT_ORIGIN_TEXT = 'API';

function validateFieldValues(fields: Record<string, any>): string | null {
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string' && value.length > MAX_FIELD_LENGTH) {
      return `Field "${key}" exceeds max length (${MAX_FIELD_LENGTH} chars)`;
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) return json({ error: 'API key is required. Use X-API-Key header.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const rateLimit = await checkRateLimit(supabase, {
      bucket: RATE_LIMIT_BUCKET,
      identifier: apiKey,
      maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
      windowMinutes: RATE_LIMIT_WINDOW_MINUTES,
    });
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit, corsHeaders);
    await recordRateLimitAttempt(supabase, RATE_LIMIT_BUCKET, apiKey);

    const { data: scopedToken, error: scopedError } = await supabase
      .from('scoped_api_tokens')
      .select('id, organization_id, is_active, usage_count')
      .eq('token_key', apiKey)
      .eq('is_active', true)
      .single();
    if (scopedError || !scopedToken) return json({ error: 'Invalid or inactive API key' }, 401);

    const organizationId = scopedToken.organization_id;
    if (!organizationId) return json({ error: 'API token has no organization_id configured' }, 400);

    await supabase
      .from('scoped_api_tokens')
      .update({ last_used_at: new Date().toISOString(), usage_count: (scopedToken.usage_count || 0) + 1 })
      .eq('id', scopedToken.id);

    const parsedBody = requestSchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return json({ error: 'Invalid request', details: parsedBody.error.issues }, 400);
    }
    const leadData = parsedBody.data;

    // Honeypot: preenchido = bot. 200 falso, sem escrever nada.
    if (honeypotPreenchido(leadData[HONEYPOT_CAMPO])) {
      return json({
        success: true,
        lead_id: crypto.randomUUID(),
        entity_id: crypto.randomUUID(),
        message: 'Lead created successfully',
        sanitized: {},
      }, 200);
    }

    console.log('Received insert-lead request:', JSON.stringify({
      source: leadData.source,
      campaign_id: leadData.campaign_id,
      organization_id: organizationId,
      has_schedule: !!leadData.auto_schedule,
      field_count: leadData.custom_fields ? Object.keys(leadData.custom_fields).length : 0,
    }));

    if (leadData.custom_fields) {
      const validationError = validateFieldValues(leadData.custom_fields);
      if (validationError) return json({ error: validationError }, 400);
    }

    // A organizacao do token manda: o resolver devolve NULL se a campanha for
    // de outra organizacao ou se o token nao bater com o que se pediu.
    const origemTexto = leadData.source?.trim() || DEFAULT_ORIGIN_TEXT;
    const resolvido = await resolverCaptacao(supabase, {
      campaignId: leadData.campaign_id ?? null,
      tokenOrganizationId: organizationId,
      origemTexto,
      originId: leadData.source_id ?? null,
    });
    if (!resolvido.ok) return json({ error: resolvido.error }, resolvido.status);

    const normalizedNames = normalizeFirstLast(leadData.first_name, leadData.last_name);
    const fieldValues: Record<string, any> = {};
    if (normalizedNames.first) fieldValues.first_name = normalizedNames.first;
    if (normalizedNames.last) fieldValues.last_name = normalizedNames.last;
    if (leadData.email) fieldValues.email = leadData.email;
    if (leadData.phone) fieldValues.phone = leadData.phone;
    if (leadData.vat) fieldValues.vat = leadData.vat;
    if (leadData.position) fieldValues.position = leadData.position;
    if (leadData.address) fieldValues.address = leadData.address;
    if (leadData.postal_code) fieldValues.postal_code = leadData.postal_code;
    if (leadData.city) fieldValues.city = leadData.city;
    if (leadData.notes) fieldValues.notes = leadData.notes;
    if (leadData.custom_fields) Object.assign(fieldValues, leadData.custom_fields);

    const mergedValidation = validateFieldValues(fieldValues);
    if (mergedValidation) return json({ error: mergedValidation }, 400);

    // Distrito (so se houver formulario resolvido pela campanha): server-side.
    if (resolvido.formId) {
      const { data: formRow } = await supabase
        .from('forms')
        .select('location_required')
        .eq('id', resolvido.formId)
        .eq('organization_id', organizationId)
        .maybeSingle();
      const { data: formFieldDefs } = await supabase
        .from('form_fields')
        .select('field_key, field_type, field_label')
        .eq('form_id', resolvido.formId)
        .eq('is_active', true);
      const locationValidation = await validateLocationDistrict({
        supabase,
        campaignId: null,
        campaignLocationRequired: false,
        formId: resolvido.formId,
        formLocationRequired: !!formRow?.location_required,
        definitions: formFieldDefs || [],
        fieldValues,
      });
      if (!locationValidation.ok) return json({ error: locationValidation.error }, 400);
    }

    const sanitizeResult = sanitizeFieldValues(fieldValues);
    const sanitizeReport = sanitizeResult.report;
    if (sanitizeReport.email_rejected) {
      console.warn(`[insert-lead] rejected invalid email "${sanitizeReport.email_rejected}"`);
    }
    if (sanitizeReport.phone_rejected) {
      console.warn(`[insert-lead] rejected invalid phone "${sanitizeReport.phone_rejected}"`);
    }
    const cleaned = { ...fieldValues, ...sanitizeResult.cleaned };
    // Contactos lidos pelos nomes directos (nao ha mapeamento de formulario aqui).
    const definitions = [
      { field_key: 'first_name', contact_field_mapping: 'first_name' },
      { field_key: 'last_name', contact_field_mapping: 'last_name' },
      { field_key: 'email', contact_field_mapping: 'email' },
      { field_key: 'phone', contact_field_mapping: 'phone' },
      { field_key: 'address', contact_field_mapping: 'address' },
      { field_key: 'postal_code', contact_field_mapping: 'postal_code' },
      { field_key: 'city', contact_field_mapping: 'city' },
    ];
    // Email, telefone e nome validados com zod antes de qualquer escrita.
    const contactosValidos = validarContactosPublicos(z, fieldValues, definitions);
    if (!contactosValidos.ok) return json({ error: contactosValidos.error }, 400);

    // Limites por campanha (organizacao do token) e por pessoa (impressao digital).
    // Impressao digital = HMAC com a chave de servidor. Sem chave falha em fechado: nada se envia.
    let impressaoKey: Uint8Array;
    try {
      impressaoKey = deriveKeyFromEnv('NIF_HMAC_KEY', 'HMAC');
    } catch (keyError) {
      console.error('[insert-lead] NIF_HMAC_KEY em falta ou invalida; pedido recusado');
      await captureError(keyError, { function: 'insert-lead', stage: 'impressao_digital_key' });
      return json({ error: 'Service temporarily unavailable', code: 'RETRY' }, 503);
    }
    const limites = await verificarLimitesCaptacao({
      supabase,
      organizationId,
      formKey: resolvido.campaignId ?? resolvido.formId ?? 'api',
      fingerprint: await impressaoDigital(leadData.email, leadData.phone, impressaoKey),
      limiteImpressao: LIMITE_IMPRESSAO_COM_TOKEN,
      bucketPrefix: RATE_LIMIT_BUCKET,
    });
    if (!limites.allowed) return rateLimitResponse(limites.result, corsHeaders);

    const fieldValuesWithMeta = {
      ...cleaned,
      _meta: {
        current_step: 1,
        total_steps: 1,
        is_complete: true,
        steps_completed: [1],
        last_updated: new Date().toISOString(),
      },
    };

    const envio = await captarEnvio({
      supabase,
      resolvido,
      tokenOrganizationId: organizationId,
      origemTexto,
      originId: leadData.source_id ?? null,
      fieldValues: fieldValuesWithMeta,
      definitions,
      currentStep: 1,
      totalSteps: 1,
      isComplete: true,
      notes: leadData.notes ?? null,
      deps: { captureError },
    });
    if (!envio.ok) return json(envio.code ? { error: envio.error, code: envio.code } : { error: envio.error }, envio.status);

    const fullLocation = [leadData.address, leadData.postal_code, leadData.city]
      .filter(Boolean)
      .join(', ') || leadData.location;

    const response: Record<string, any> = {
      success: true,
      // lead_id mantem-se (integracoes) e passa a ser o id da submissao nova.
      lead_id: envio.submissionId,
      entity_id: envio.entityId,
      // Igual para pessoa nova e conhecida: nada denuncia se a pessoa ja existia.
      message: 'Lead created successfully',
      sanitized: sanitizeReport,
    };

    if (fullLocation || leadData.postal_code) {
      response.location = {
        address: leadData.address,
        postal_code: leadData.postal_code,
        city: leadData.city,
        full_location: fullLocation,
        latitude: leadData.latitude,
        longitude: leadData.longitude,
      };
    }

    // Auto-schedule sobre a ENTIDADE (entity_id). A visita fica em
    // schedule_items ligada a entidade; nao ha estado de lead para actualizar.
    if (leadData.auto_schedule) {
      let scheduleResult: Record<string, any> | null = null;
      try {
        const scheduleResponse = await fetch(`${supabaseUrl}/functions/v1/auto-schedule`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'x-internal-source': 'insert-lead',
          },
          body: JSON.stringify(montarPedidoAutoSchedule({
            entityId: envio.entityId,
            organizationId,
            fullLocation,
            lead: leadData,
            options: leadData.schedule_options,
          })),
        });
        scheduleResult = await scheduleResponse.json();
      } catch (scheduleError) {
        console.error('[insert-lead] erro a chamar auto-schedule:', scheduleError);
        await captureError(scheduleError, { function: "insert-lead", entity_id: envio.entityId });
        scheduleResult = { success: false, error: 'Failed to auto-schedule' };
      }
      response.schedule = scheduleResult;
      response.message += scheduleResult?.success
        ? ' and visit scheduled successfully'
        : ` but scheduling failed: ${scheduleResult?.error || 'Unknown error'}`;
    }

    return json(response, 201);
  } catch (error: any) {
    console.error('Error in insert-lead function:', error);
    await captureError(error, { function: "insert-lead" });
    return json({ error: 'Internal server error' }, 500);
  }
});
