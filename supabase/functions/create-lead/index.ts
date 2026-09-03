import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { z } from "npm:zod";
import { sanitizeTracking } from '../_shared/leadTracking.ts';
import { resolveOriginWithoutUtmSource } from '../_shared/paidClickSource.ts';

const requestSchema = z.object({
  // Optional: forms without an associated campaign must still create a lead
  // instead of 400ing (confirmed live: the recommended embed snippet never
  // sends campaign_id for such forms). When absent, the campaign is resolved
  // from campaigns.form_id below; if none exists either, the lead is created
  // without a campaign.
  campaign_id: z.string().uuid().optional(),
  form_id: z.string().uuid().optional(),
  business_unit_id: z.string().uuid().optional(),
  step_number: z.number().optional(),
  field_values: z.record(z.unknown()).optional(),
  source: z.string().optional(),
  // Nullable because PublicLeadForm.tsx sends `source_id: resolvedSourceId ||
  // null` whenever no source resolved for this visit (the common case) -
  // .optional() alone only accepts undefined, rejecting the real null the
  // client sends and blocking every such submission with a 400. Line ~145
  // already treats `?? null` as the correct "no source" fallback, so this
  // just matches validation to the behavior that was already assumed.
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
import { runMarketingAttribution } from '../_shared/marketingAttribution.ts';
import { sendLeadConfirmationEmail, queueSchedulingInviteRecovery } from '../_shared/formEmails.ts';
import { composeDisplayName, normalizeFirstLast } from '../_shared/composeDisplayName.ts';
import {
  findLocalEntityForOrg,
  collectDedupCandidatesForOrg,
  classifyEntityInOrg,
  emitFormResubmissionAlert,
  emitDedupSubmissionNotification,
  type DedupNotificationTarget,
  mergeFieldValuesNonDestructive,
  ensureEntityOrgLinkSR,
} from '../_shared/entityScopedLookup.ts';
import { classifyDedupOutcome, type DedupOutcome } from '../_shared/leadDedup.ts';
import { deriveKeyFromEnv, hashNif } from '../_shared/nifCrypto.ts';
import {
  sanitizeEmail,
  sanitizePhone,
  sanitizeFieldValues,
} from '../_shared/inputSanitizers.ts';
import {
  cleanupCreatedEntityArtifacts,
  resolveCanonicalFormId,
  resolveRootOrganizationId,
  validateLocationDistrict,
} from '../_shared/leadsValidation.ts';
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, getClientIp, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";

initSentry();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
};

const RATE_LIMIT_BUCKET = 'create-lead';
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MINUTES = 1;

// --- Input Validation ---
const MAX_FIELD_VALUE_LENGTH = 10_000;

function validateFieldValues(field_values: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(field_values)) {
    if (key === '_meta') continue;
    if (typeof value === 'string' && value.length > MAX_FIELD_VALUE_LENGTH) {
      return `Field "${key}" exceeds maximum length of ${MAX_FIELD_VALUE_LENGTH} characters`;
    }
  }
  return null;
}

// create_entity_with_contacts_and_roles (20260821020000) requires a non-null
// p_created_by when called as service_role with no auth.uid() (this public,
// anonymous Edge Function never has one). This resolves an org admin the
// same way insert-lead does. Shared by both the new-entity RPC call and the
// reused-entity backfill inserts below, so the admin-membership lookup only
// needs to be written once.
async function resolveAdminCreatedBy(supabase: any, rootOrgId: string): Promise<string | null> {
  const adminRoleCodes = ['super_admin', 'admin', 'org_admin'];
  const { data: adminRoleRows } = await supabase
    .from('anew_roles')
    .select('id')
    .in('code', adminRoleCodes);
  const adminRoleIds = (adminRoleRows || []).map((r: { id: string }) => r.id);
  if (adminRoleIds.length === 0) return null;
  const { data: adminMembership } = await supabase
    .from('anew_memberships')
    .select('user_id')
    .eq('organization_id', rootOrgId)
    .eq('status', 'active')
    .in('role_id', adminRoleIds)
    .limit(1)
    .maybeSingle();
  return adminMembership?.user_id || null;
}

/**
 * Public Lead Creation API (Multi-Step Support)
 * 
 * PUBLIC endpoint (no authentication required).
 * Creates leads in the dedicated leads table with dynamic fields.
 * Validates required and unique fields per campaign configuration.
 * Supports multi-step forms by tracking step progress.
 * 
 * Required:
 * - campaign_id: UUID of the campaign
 * 
 * Optional:
 * - business_unit_id: UUID
 * - step_number: Current step being submitted (default: 1)
 * - field_values: Object with field_key: value pairs
 * - source: string
 * - notes: string
 * - tags: string[]
 * 
 * Response includes:
 * - lead_id: for subsequent update-lead calls (kept for backwards compatibility)
 * - target_type ("lead" | "contact" | "client") + target_id: polymorphic
 *   continuation key. When the resolved entity already classifies as an
 *   active contact/client in this org, no anew_leads row is created; the
 *   step progress accumulates in form_submissions instead, and target_id
 *   points at that form_submissions row (not the contact/client id).
 * - current_step, total_steps, is_complete: for multi-step tracking
 * - next_step: null if complete, or the next step number
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use POST.' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Rate limiting check — persistent, DB-backed (survives cold starts / shared across instances)
    const clientIp = getClientIp(req);
    const rateLimit = await checkRateLimit(supabase, {
      bucket: RATE_LIMIT_BUCKET,
      identifier: clientIp,
      maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
      windowMinutes: RATE_LIMIT_WINDOW_MINUTES,
    });
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit, corsHeaders);
    }
    await recordRateLimitAttempt(supabase, RATE_LIMIT_BUCKET, clientIp);

    const body = await req.json();
    const parsedBody = requestSchema.safeParse(body);
    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: parsedBody.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // SECURITY: company_id is intentionally NOT destructured from the body.
    // organization_id is always derived from campaigns.organization_id (single source of truth)
    // to prevent cross-tenant lead injection via a public endpoint.
    const { campaign_id, form_id, business_unit_id, step_number, field_values, source, notes, tags, from_chat_widget, tracking, embed, needs_manual_scheduling, lang } = parsedBody.data;
    const leadLocale = (typeof lang === 'string' && lang.trim()) ? lang.trim().toLowerCase() : null;
    // Aceitar tanto snake_case como camelCase para compatibilidade com integrações antigas/novas.
    const incomingSourceId: string | null = parsedBody.data.source_id ?? parsedBody.data.sourceId ?? null;
    const ALLOWED_EMBED_KINDS = new Set(['popup', 'inline', 'widget', 'utm', 'chat', '']);
    const rawEmbedKind = typeof embed === 'string' ? embed.trim().toLowerCase() : '';
    const embedKind = ALLOWED_EMBED_KINDS.has(rawEmbedKind) ? rawEmbedKind : '';
    if (rawEmbedKind && !ALLOWED_EMBED_KINDS.has(rawEmbedKind)) {
      console.warn('[create-lead] unknown embed kind, normalising to empty:', rawEmbedKind);
    }

    // Safe logging — no PII
    console.log('Received lead request:', JSON.stringify({
      campaign_id, form_id, step_number, source,
      from_chat_widget, field_count: Object.keys(field_values || {}).length
    }));

    if (!campaign_id && !form_id) {
      return new Response(
        JSON.stringify({ error: 'campaign_id or form_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    type CampaignRow = {
      id: string;
      name: string | null;
      organization_id: string;
      status: string;
      form_id: string | null;
      location_required: boolean | null;
    };

    let campaign: CampaignRow | null = null;

    if (campaign_id) {
      // Explicit campaign_id: existing, unchanged behavior — 404 when it
      // doesn't exist, 400 when it isn't active.
      const { data, error: campaignError } = await supabase
        .from('campaigns')
        .select('id, name, organization_id, status, form_id, location_required')
        .eq('id', campaign_id)
        .single();

      if (campaignError || !data) {
        return new Response(
          JSON.stringify({ error: 'Campaign not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (data.status !== 'active') {
        return new Response(
          JSON.stringify({ error: 'Campaign is not active', status: data.status }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      campaign = data;
    } else if (form_id) {
      // No campaign_id supplied — resolve the campaign that owns this form
      // (campaigns.form_id), preferring an active one. A form with no
      // campaign at all (or none active) is valid: the lead is still
      // created below, just without campaign attribution.
      const { data: campaignsForForm } = await supabase
        .from('campaigns')
        .select('id, name, organization_id, status, form_id, location_required')
        .eq('form_id', form_id)
        .order('created_at', { ascending: true });
      campaign = (campaignsForForm || []).find((c: CampaignRow) => c.status === 'active') || null;
    }

    // Resolved campaign id used for every downstream campaign-scoped
    // read/write below (null when this submission has no campaign).
    const resolvedCampaignId: string | null = campaign?.id ?? null;

    let organization_id: string;
    let canonicalFormId: string | null;

    if (campaign) {
      organization_id = campaign.organization_id;
      const canonicalForm = resolveCanonicalFormId(form_id, campaign.form_id);
      if (canonicalForm.error) {
        return new Response(
          JSON.stringify({ error: canonicalForm.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      canonicalFormId = canonicalForm.formId;
    } else {
      // No campaign at all — organization comes from the form itself.
      const { data: formRow, error: formRowError } = await supabase
        .from('forms')
        .select('id, organization_id')
        .eq('id', form_id)
        .maybeSingle();
      if (formRowError || !formRow?.organization_id) {
        return new Response(
          JSON.stringify({ error: 'Form not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      organization_id = formRow.organization_id;
      canonicalFormId = form_id as string;
    }

    if (!field_values || typeof field_values !== 'object') {
      return new Response(
        JSON.stringify({ error: 'field_values object is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate field value sizes
    const fieldValidationError = validateFieldValues(field_values);
    if (fieldValidationError) {
      return new Response(
        JSON.stringify({ error: fieldValidationError }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get total steps and field definitions
    // Priority: form_id (form_steps/form_fields) > campaign_id (campaign_form_steps/lead_field_definitions)
    let totalSteps = 1;
    let definitions: any[] = [];
    let formLocationRequired = false;
    // Nome do formulario, so para o texto da notificacao do comercial
    // ("...voltou a submeter o formulario <NOME>."). Sem nome o texto cai para
    // a variante curta; nunca bloqueia nada.
    let formName: string | null = campaign?.name ?? null;

    if (canonicalFormId) {
      // Fetch location_required alongside the form-level tables — needed for
      // the server-side district validation below (CRITICAL: this endpoint is
      // public and must not trust the client-side location check alone).
      const { data: formLocationData } = await supabase
        .from('forms')
        .select('name, location_required')
        .eq('id', canonicalFormId)
        .maybeSingle();
      formLocationRequired = !!formLocationData?.location_required;
      formName = formLocationData?.name ?? formName;

      // Use form-level tables
      const { data: formStepsData } = await supabase
        .from('form_steps')
        .select('step_number')
        .eq('form_id', canonicalFormId)
        .order('step_number', { ascending: false })
        .limit(1);
      totalSteps = formStepsData?.[0]?.step_number || 1;

      const { data: formFieldDefs, error: formFieldDefsError } = await supabase
        .from('form_fields')
        .select('*, step_number, field_key, field_label, is_required, is_unique, is_active')
        .eq('form_id', canonicalFormId)
        .eq('is_active', true)
        .order('sort_order');
      if (formFieldDefsError) {
        console.error('Error fetching form field definitions:', formFieldDefsError);
      }
      definitions = formFieldDefs || [];
      console.log('Using form-level steps/fields. form_id:', canonicalFormId, 'totalSteps:', totalSteps, 'fields:', definitions.length);
    } else {
      // Fallback: use campaign-level tables (only reachable when a campaign
      // was resolved above, so resolvedCampaignId is guaranteed non-null here).
      const { data: stepsData } = await supabase
        .from('campaign_form_steps')
        .select('step_number')
        .eq('campaign_id', resolvedCampaignId)
        .order('step_number', { ascending: false })
        .limit(1);
      totalSteps = stepsData?.[0]?.step_number || 1;

      const { data: fieldDefs, error: fieldDefsError } = await supabase
        .from('lead_field_definitions')
        .select('*')
        .eq('campaign_id', resolvedCampaignId)
        .eq('is_active', true)
        .order('sort_order');
      if (fieldDefsError) {
        console.error('Error fetching field definitions:', fieldDefsError);
      }
      definitions = fieldDefs || [];
      
    }

    // --- Defensive sanitization of field_values BEFORE any persistence,
    // dedup lookup, or required/unique validation. Rejects corrupted
    // emails/phones (multiple @, repeated blocks), dedupes arrays, trims
    // strings. Never removes keys. See mem://security/sanitization/...
    const _sanitizeContactMap: Record<string, string> = {};
    for (const def of definitions) {
      if (def.contact_field_mapping && def.field_key) {
        _sanitizeContactMap[def.contact_field_mapping] = def.field_key;
      }
    }
    const _sanitizeResult = sanitizeFieldValues(field_values, _sanitizeContactMap);
    Object.assign(field_values, _sanitizeResult.cleaned);
    const sanitizeReport = _sanitizeResult.report;
    if (sanitizeReport.email_rejected) {
      console.warn(`[create-lead] rejected invalid email "${sanitizeReport.email_rejected}"`);
    }
    if (sanitizeReport.phone_rejected) {
      console.warn(`[create-lead] rejected invalid phone "${sanitizeReport.phone_rejected}"`);
    }

    let currentStep = step_number || 1;
    const stepsCompleted: number[] = [];

    // For chat widget submissions: calculate which steps are complete
    if (from_chat_widget) {
      // Find the highest step where all required fields are filled
      for (let step = 1; step <= totalSteps; step++) {
        const stepFields = definitions.filter((d: any) => d.step_number === step);
        const allRequiredFilled = stepFields
          .filter((d: any) => d.is_required)
          .every((d: any) => field_values[d.field_key]);

        if (allRequiredFilled || stepFields.length === 0) {
          stepsCompleted.push(step);
        }
      }

      // Set current step to the last completed step or total if all done
      if (stepsCompleted.length === totalSteps) {
        currentStep = totalSteps;
      } else {
        currentStep = Math.max(...stepsCompleted, 1);
      }
    }

    // Validate required fields for current step only (skip for chat widget as we already calculated)
    if (!from_chat_widget) {
      const currentStepFields = definitions.filter((d: any) => d.step_number === currentStep);
      const missingRequired: string[] = [];
      
      for (const def of currentStepFields) {
        if (def.is_required && !field_values[def.field_key]) {
          missingRequired.push(def.field_label);
        }
      }

      if (missingRequired.length > 0) {
        return new Response(
          JSON.stringify({ 
            error: `Missing required fields: ${missingRequired.join(', ')}`,
            missing_fields: missingRequired
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Validate unique fields for all submitted fields
    const uniqueFields = definitions.filter((d: any) => d.is_unique);
    for (const def of uniqueFields) {
      const value = field_values[def.field_key];
      if (value) {
        // Scope dedup by campaign when there is one; otherwise scope by
        // organization + "no campaign" so a campaignless form still only
        // dedups against its own kind of submissions, never cross-org.
        let dedupQuery = supabase
          .from('anew_leads')
          .select('id')
          .eq('organization_id', organization_id)
          .filter('field_values->>'+def.field_key, 'eq', value);
        dedupQuery = resolvedCampaignId
          ? dedupQuery.eq('campaign_id', resolvedCampaignId)
          : dedupQuery.is('campaign_id', null);
        const { data: existing } = await dedupQuery.maybeSingle();

        if (existing) {
          return new Response(
            JSON.stringify({ 
              error: `A lead with this ${def.field_label} already exists`,
              duplicate_field: def.field_key,
              duplicate_value: value
            }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // CRITICAL: server-side enforcement of location_required/allowed_districts.
    // The public form only checks this client-side (PublicLeadForm.tsx); a
    // direct API call with a district outside campaign_districts/form_districts
    // must be rejected here, mirroring the calculation in get-form-data.
    const locationValidation = await validateLocationDistrict({
      supabase,
      campaignId: resolvedCampaignId,
      campaignLocationRequired: campaign?.location_required ?? false,
      formId: canonicalFormId,
      formLocationRequired,
      definitions,
      fieldValues: field_values,
    });
    if (!locationValidation.ok) {
      return new Response(
        JSON.stringify({ error: locationValidation.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate business_unit belongs to company
    if (business_unit_id) {
      const { data: bu, error: buError } = await supabase
        .from('anew_organizations')
        .select('id, type')
        .eq('id', business_unit_id)
        .single();

      if (buError || !bu) {
        return new Response(
          JSON.stringify({ error: 'Business unit not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      // Validate via hierarchy
      const { data: hierarchyCheck } = await supabase
        .from('anew_hierarchy')
        .select('id')
        .eq('parent_org_id', organization_id)
        .eq('child_org_id', business_unit_id)
        .maybeSingle();
      
      if (!hierarchyCheck) {
        return new Response(
          JSON.stringify({ error: 'Business unit does not belong to the specified organization' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Determine if form is complete
    const isComplete = currentStep >= totalSteps;

    // Reuse stepsCompleted computed above for chat widget; otherwise just current step
    const stepsCompletedArray = from_chat_widget ? stepsCompleted : [currentStep];

    // Optional, additive: sanitize incoming tracking and store under _meta.tracking.
    const safeTracking = sanitizeTracking(tracking);

    // Prepare field_values with metadata
    const fieldValuesWithMeta: Record<string, any> = {
      ...field_values,
      _meta: {
        current_step: currentStep,
        total_steps: totalSteps,
        is_complete: isComplete,
        steps_completed: stepsCompletedArray,
        last_updated: new Date().toISOString(),
        ...(safeTracking ? { tracking: safeTracking } : {}),
      }
    };

    // Get root_organization_id from hierarchy
    const rootOrgId = await resolveRootOrganizationId(supabase, organization_id) || organization_id;

    // --- Build mapping from contact_field_mapping → field_key ---
    const contactMappingToKey: Record<string, string> = {};
    for (const def of definitions) {
      if (def.contact_field_mapping && def.field_key) {
        contactMappingToKey[def.contact_field_mapping] = def.field_key;
      }
    }

    // Helper: resolve value using mapping first, then hardcoded aliases as fallback
    const resolveContact = (prop: string, ...aliases: string[]): any => {
      // 1. Mapping-first: use the field_key mapped to this contact property
      const mappedKey = contactMappingToKey[prop];
      if (mappedKey && field_values?.[mappedKey]) return field_values[mappedKey];
      // 2. Direct match on property name
      if (field_values?.[prop]) return field_values[prop];
      // 3. Hardcoded aliases fallback (retrocompatibility)
      for (const alias of aliases) {
        if (field_values?.[alias]) return field_values[alias];
      }
      return null;
    };

    // --- Sanitize: treat common placeholders as empty for dedup purposes ---
    const isPlaceholder = (val: any): boolean => {
      if (val == null) return true;
      const s = String(val).trim();
      if (!s || s === '-' || s === '--' || s === '0' || s === 'N/A' || s === 'n/a' || s === 'NA') return true;
      return false;
    };
    // Email/phone validity is now delegated to the shared sanitizers; the
    // local isValid* helpers are kept only for backwards reference where the
    // surrounding code may still call them (placeholder detection only).
    const isValidEmail = (val: any): boolean => sanitizeEmail(val) !== null;
    const isValidPhone = (val: any): boolean => sanitizePhone(val) !== null;

    // --- Entity deduplication: reuse existing entity if email matches ---
    let entityId: string | null = null;
    let entityWasCreated = false; // tracks whether we own this entity (for compensation cleanup)
    const rawEmail = resolveContact('email', 'po_email', 'Email');
    const rawPhone = resolveContact('phone', 'po_telefone', 'telefone');
    const leadEmail = sanitizeEmail(rawEmail);
    const leadPhone = sanitizePhone(rawPhone);
    const rawFirstName = isPlaceholder(resolveContact('first_name', 'po_nome', 'nome')) ? '' : String(resolveContact('first_name', 'po_nome', 'nome')).trim();
    const rawLastName = isPlaceholder(resolveContact('last_name', 'po_apelido', 'apelido')) ? '' : String(resolveContact('last_name', 'po_apelido', 'apelido')).trim();
    // Defend against integrations that send the full name in BOTH fields (META Lead Ads).
    const normalizedNames = normalizeFirstLast(rawFirstName, rawLastName);
    const leadFirstName = normalizedNames.first || '';
    const leadLastName = normalizedNames.last || '';

    // Persist normalized names back into field_values for the new lead row.
    // Only touches keys that already exist (won't invent new ones) and only
    // when normalization actually changed the value.
    if (leadFirstName && leadFirstName !== rawFirstName) {
      const fnKey = contactMappingToKey['first_name'] || (fieldValuesWithMeta.first_name !== undefined ? 'first_name' : (fieldValuesWithMeta.po_nome !== undefined ? 'po_nome' : (fieldValuesWithMeta.nome !== undefined ? 'nome' : null)));
      if (fnKey) fieldValuesWithMeta[fnKey] = leadFirstName;
    }
    if (leadLastName && leadLastName !== rawLastName) {
      const lnKey = contactMappingToKey['last_name'] || (fieldValuesWithMeta.last_name !== undefined ? 'last_name' : (fieldValuesWithMeta.po_apelido !== undefined ? 'po_apelido' : (fieldValuesWithMeta.apelido !== undefined ? 'apelido' : null)));
      if (lnKey) {
        fieldValuesWithMeta[lnKey] = leadLastName;
      } else {
        // last_name didn't exist as separate field but normalization split it out — add it.
        fieldValuesWithMeta.last_name = leadLastName;
      }
    }

    // Resolve VAT/NIF from incoming field values (heuristic — same patterns as manual flows)
    const rawVat = (() => {
      for (const k of Object.keys(fieldValuesWithMeta)) {
        const lk = k.toLowerCase();
        if (lk.includes('nif') || lk.includes('vat') || lk === 'po_nif') {
          const v = fieldValuesWithMeta[k];
          if (v && !isPlaceholder(v)) return String(v).trim().toUpperCase();
        }
      }
      return null;
    })();

    // Compute the NIF hash server-side so the plaintext rawVat never reaches
    // the entity-matching query — same HMAC-SHA256 pattern used by
    // search-entities / fiscal-entity-resolve (see _shared/nifCrypto.ts).
    // Best-effort: a hashing failure (e.g. missing key) must not block the
    // public form; it just means NIF-based dedup is skipped for this submission.
    let rawVatHash: string | null = null;
    if (rawVat) {
      try {
        const hmacKey = deriveKeyFromEnv('NIF_HMAC_KEY', 'HMAC');
        rawVatHash = await hashNif(rawVat, hmacKey);
      } catch (hashError) {
        console.error('[create-lead] failed to hash rawVat for entity lookup:', hashError instanceof Error ? hashError.message : hashError);
      }
    }

    // --- Local-scoped entity lookup (form receiving org ONLY) ---
    // Cross-org identity is intentionally ignored: another org's entity is
    // never silently shared into this org by the public form. Manual UI is
    // the only path that can opt-in to cross-org sharing.
    const scopedHit = await findLocalEntityForOrg({
      supabase,
      organizationId: organization_id,
      email: leadEmail,
      phone: leadPhone,
      nifHash: rawVatHash,
    });

    // --- Detecao de duplicados: os 8 resultados (ver _shared/leadDedup.ts) ---
    // Compara-se SO email e telefone, lidos pelo mapeamento do formulario.
    // Falhar aqui e fail-soft: sem quadro de deduplicacao seguimos o caminho
    // antigo (o `scopedHit` acima), nunca se bloqueia o visitante.
    let dedupOutcome: DedupOutcome | null = null;
    try {
      const dedupCandidates = await collectDedupCandidatesForOrg({
        supabase,
        organizationId: organization_id,
        email: leadEmail,
        phone: leadPhone,
      });
      dedupOutcome = classifyDedupOutcome(dedupCandidates, { email: leadEmail, phone: leadPhone });
    } catch (dedupErr) {
      console.error('[create-lead] dedup classification failed (continuing):', dedupErr);
    }

    // Entidade escolhida pela deteccao (casos 01 a 06). No CONFLITO (06) manda
    // a do email e a do telefone fica registada em `conflicting_entity_id` — e
    // essa marca que leva a submissao a fila de revisao.
    const dedupEntityId =
      dedupOutcome && (dedupOutcome.kind === 'MATCH_FORTE' || dedupOutcome.kind === 'MATCH_EMAIL' || dedupOutcome.kind === 'MATCH_TELEFONE')
        ? dedupOutcome.entityId
        : dedupOutcome?.kind === 'CONFLITO'
          ? dedupOutcome.entityIdEmail
          : null;
    const conflictingEntityId = dedupOutcome?.kind === 'CONFLITO' ? dedupOutcome.entityIdTelefone : null;

    // A deteccao manda sobre o `scopedHit` quando encontrou alguem: email e
    // telefone sao a autoridade acordada. Sem match (07/08) o `scopedHit` ainda
    // pode reaproveitar a entidade por NIF — isso e reutilizacao de entidade,
    // nao deduplicacao de lead.
    entityId = dedupEntityId ?? scopedHit?.entityId ?? null;

    // INVARIANTE: uma lead so nasce quando a entidade NAO tem nenhuma. Quando
    // a entidade ja tem lead activa (ou e cliente), a submissao acumula em
    // form_submissions apontada a esse registo, e nao nasce lead nenhuma.
    let existingTarget: { targetType: 'lead' | 'client'; targetId: string } | null = null;
    // Uma lead SEM comercial (nem `assigned_to` nem `created_by`) que recebe
    // uma submissao nova comporta-se como entrada nova: sobe ao topo da
    // listagem. Nao nasce registo nenhum — carimba-se `last_activity_at` na
    // lead que ja existe. `activeLeadAssigneeAnewUserId` e exactamente
    // `assigned_to ?? created_by ?? null` (ver entityScopedLookup.ts).
    let existingLeadIsUnowned = false;
    // Comercial responsavel pelo registo que recebeu a submissao
    // (`assigned_to ?? created_by`), guardado aqui porque o `summary` do
    // classify vive num bloco interno e a notificacao so e escrita la a
    // baixo, depois de a submissao estar mesmo gravada. `null` significa
    // exactamente "sem dono": nao se notifica ninguem.
    let existingTargetAssigneeAnewUserId: string | null = null;

    if (entityId) {
      console.log(
        '[create-lead] reusing local entity via',
        dedupEntityId ? `dedup:${dedupOutcome?.kind}` : scopedHit?.matchField,
        entityId,
      );

      // Classify entity in the receiving org. If it already has an active lead
      // or is a client, emit an internal alert for the responsible commercial
      // and merge new field values into the existing record — but NEVER block
      // the visitor: the multi-step form must flow exactly like a new entity
      // (create-lead -> update-lead -> success).
      // Quando ha registo existente NAO se cai no insert em anew_leads abaixo:
      // e essa queda que estava a criar leads repetidas para quem ja tinha uma.
      // O progresso dos passos acumula em form_submissions.
      // This result MUST survive even if the merge/alert side effects below
      // fail — otherwise a transient error would silently fall through to the
      // anew_leads insert path for an entity that already has a lead,
      // reproducing the exact bug this branch exists to prevent. Keep
      // classification outside the side-effects try/catch.
      let classifySummary: Awaited<ReturnType<typeof classifyEntityInOrg>> | null = null;
      try {
        classifySummary = await classifyEntityInOrg({ supabase, entityId, organizationId: organization_id });
      } catch (classifyErr) {
        console.error('[create-lead] classifyEntityInOrg failed:', classifyErr);
      }

      if (classifySummary) {
        const summary = classifySummary;
        // 'contact' esta FORA de proposito: o modulo de Contactos foi retirado
        // e o teste do contacto vinha ANTES do da lead, pelo que quem era
        // contacto E lead nunca chegava ao teste certo — e ganhava lead nova.
        // Quem e so contacto e nao tem lead nenhuma cai no caminho normal e
        // ganha a primeira lead, que e exactamente a invariante acordada.
        if (summary.clientId) {
          existingTarget = { targetType: 'client', targetId: summary.clientId };
          existingTargetAssigneeAnewUserId = summary.clientAssigneeAnewUserId ?? null;
        } else if (summary.activeLeadId) {
          existingTarget = { targetType: 'lead', targetId: summary.activeLeadId };
          existingTargetAssigneeAnewUserId = summary.activeLeadAssigneeAnewUserId ?? null;
          existingLeadIsUnowned = summary.activeLeadAssigneeAnewUserId === null;
        }

        // Best-effort side effects: merge new field values into the existing
        // record and notify the responsible commercial. A failure here must
        // NOT unset existingTarget (already captured above) and must NOT block
        // the visitor's form flow.
        if (existingTarget) {
          const target = existingTarget;
          try {
            const targetTable = target.targetType === 'lead' ? 'anew_leads' : 'anew_clients';
            const diff = await mergeFieldValuesNonDestructive({
              supabase, table: targetTable as any, rowId: target.targetId, newFieldValues: fieldValuesWithMeta,
            });
            // A notificacao tem de apontar ao registo que recebeu a submissao,
            // nao ao `targetType` historico do classify (que da o contacto como
            // vencedor mesmo quando e a lead que manda aqui).
            await emitFormResubmissionAlert({
              supabase,
              organizationId: organization_id,
              entityId,
              summary: {
                ...summary,
                targetType: target.targetType,
                targetId: target.targetId,
                assigneeAnewUserId: target.targetType === 'client'
                  ? (summary.clientAssigneeAnewUserId ?? summary.assigneeAnewUserId)
                  : (summary.activeLeadAssigneeAnewUserId ?? summary.assigneeAnewUserId),
              },
              campaignId: resolvedCampaignId,
              formId: canonicalFormId ?? null,
              fieldValuesDiff: diff,
              displayName: composeDisplayName(leadFirstName, leadLastName) || null,
            });
          } catch (alertErr) {
            console.error('[create-lead] duplicate-entity alert side-effect failed (continuing):', alertErr);
          }
        }
      }

      // Reused entity, but no active contact/client/lead — proceed normally.
      if (leadFirstName || leadLastName) {
        const { data: existingEntity } = await supabase.from('anew_entities').select('first_name, last_name').eq('id', entityId).single();
        if (existingEntity && !existingEntity.first_name && !existingEntity.last_name) {
          const nameUpdate: Record<string, any> = {};
          if (leadFirstName) nameUpdate.first_name = leadFirstName;
          if (leadLastName) nameUpdate.last_name = leadLastName;
          await supabase.from('anew_entities').update(nameUpdate).eq('id', entityId);
        }
      }

      // --- Reused-entity backfill: email / phone / address ---
      // Conservative, additive-only: only inserted when the entity has ZERO
      // rows in the corresponding table (same pattern as the name backfill
      // above, applied to "no row" instead of "empty field"). NEVER updates
      // or overwrites an existing row — a value already on file may have
      // been corrected manually in the CRM afterward. Every step is
      // fail-soft: an error here must not block the already-created lead's
      // success response, so each is wrapped in its own try/catch and only
      // logged via console.error (same pattern as emitFormResubmissionAlert
      // and the post-completion emails below).
      // `!existingTarget`: quando a submissao vai acumular em form_submissions,
      // NUNCA se escreve na ficha da pessoa. Email novo / telefone novo ficam
      // so assinalados na submissao. O backfill continua a valer para a
      // entidade reaproveitada que vai mesmo ganhar a primeira lead.
      if (leadEmail && !existingTarget) {
        try {
          const { count: emailCount, error: emailCountError } = await supabase
            .from('anew_entity_emails')
            .select('id', { count: 'exact', head: true })
            .eq('entity_id', entityId);
          if (emailCountError) {
            console.error('[create-lead] reused-entity email count lookup failed (continuing):', emailCountError);
          } else if (!emailCount) {
            const backfillCreatedBy = await resolveAdminCreatedBy(supabase, rootOrgId);
            const { error: emailInsertError } = await supabase.from('anew_entity_emails').insert({
              entity_id: entityId,
              email: leadEmail.toLowerCase().trim(),
              email_type: 'personal',
              is_primary: true,
              created_by: backfillCreatedBy,
            });
            if (emailInsertError) {
              console.error('[create-lead] reused-entity email backfill insert failed (continuing):', emailInsertError);
            }
          }
        } catch (emailBackfillErr) {
          console.error('[create-lead] reused-entity email backfill failed (continuing):', emailBackfillErr);
        }
      }

      if (leadPhone && !existingTarget) {
        try {
          const { count: phoneCount, error: phoneCountError } = await supabase
            .from('anew_entity_phones')
            .select('id', { count: 'exact', head: true })
            .eq('entity_id', entityId);
          if (phoneCountError) {
            console.error('[create-lead] reused-entity phone count lookup failed (continuing):', phoneCountError);
          } else if (!phoneCount) {
            const backfillCreatedBy = await resolveAdminCreatedBy(supabase, rootOrgId);
            const { error: phoneInsertError } = await supabase.from('anew_entity_phones').insert({
              entity_id: entityId,
              phone_number: leadPhone,
              phone_type: 'mobile',
              is_primary: true,
              created_by: backfillCreatedBy,
            });
            if (phoneInsertError) {
              console.error('[create-lead] reused-entity phone backfill insert failed (continuing):', phoneInsertError);
            }
          }
        } catch (phoneBackfillErr) {
          console.error('[create-lead] reused-entity phone backfill failed (continuing):', phoneBackfillErr);
        }
      }

      // Address: reuse the same street/postal/city resolution + placeholder
      // rules as the new-entity RPC payload below (resolveContact + L19:
      // never persist with only street or only postal, never 'N/A'/'0000-000').
      const backfillStreet = String(resolveContact('address', 'po_morada', 'morada') || '').trim();
      const backfillPostal = String(resolveContact('postal_code', 'po_codigo_postal', 'codigo_postal') || '').trim();
      const backfillCity = String(resolveContact('city', 'po_localidade', 'localidade', 'cidade') || '').trim();
      if (backfillStreet && backfillPostal && !existingTarget) {
        try {
          const { count: addressCount, error: addressCountError } = await supabase
            .from('anew_entity_addresses')
            .select('id', { count: 'exact', head: true })
            .eq('entity_id', entityId);
          if (addressCountError) {
            console.error('[create-lead] reused-entity address count lookup failed (continuing):', addressCountError);
          } else if (!addressCount) {
            const backfillCreatedBy = await resolveAdminCreatedBy(supabase, rootOrgId);
            // address_key matches create_entity_with_contacts_and_roles:
            // lower(concat_ws('|', street, postal, city)) — see migration
            // 20260821020000_security_definer_identity_from_authuid_fix_record.sql:106.
            const addressKey = [backfillStreet, backfillPostal, backfillCity].join('|').toLowerCase();
            let backfillAddressId: string | null = null;
            const { data: existingAddress, error: existingAddressError } = await supabase
              .from('anew_addresses')
              .select('id')
              .eq('address_key', addressKey)
              .maybeSingle();
            if (existingAddressError) {
              console.error('[create-lead] reused-entity address_key lookup failed (continuing):', existingAddressError);
            }
            if (existingAddress?.id) {
              // Reuse the existing address row instead of creating a duplicate.
              backfillAddressId = existingAddress.id;
            } else {
              const { data: newAddress, error: addressInsertError } = await supabase
                .from('anew_addresses')
                .insert({
                  address_key: addressKey,
                  street: backfillStreet,
                  number: '',
                  postal_code: backfillPostal,
                  city: backfillCity || '',
                  country: 'PT',
                  created_by: backfillCreatedBy,
                })
                .select('id')
                .single();
              if (addressInsertError) {
                console.error('[create-lead] reused-entity address backfill insert failed (continuing):', addressInsertError);
              } else {
                backfillAddressId = newAddress?.id || null;
              }
            }
            if (backfillAddressId) {
              const { error: entityAddressInsertError } = await supabase.from('anew_entity_addresses').insert({
                entity_id: entityId,
                address_id: backfillAddressId,
                address_type: 'primary',
                is_primary: true,
                created_by: backfillCreatedBy,
              });
              if (entityAddressInsertError) {
                console.error('[create-lead] reused-entity entity_address backfill insert failed (continuing):', entityAddressInsertError);
              }
            }
          }
        } catch (addressBackfillErr) {
          console.error('[create-lead] reused-entity address backfill failed (continuing):', addressBackfillErr);
        }
      }
    }

    // --- Registo existente: nao se toca em anew_leads, acumula-se em form_submissions ---
    if (existingTarget) {
      // 03/05 — a submissao trouxe um telefone ou um email que a ficha nao
      // tem. NUNCA se escreve na ficha da pessoa: o dado novo fica assinalado
      // aqui, em `_meta.dedup`, e o separador "Formularios" mostra-o marcado
      // como "nao gravado". E JSON dentro de `field_values`, por isso nao
      // depende de nenhuma coluna nova.
      // POR QUE bateu — guardado SEMPRE, nao so quando ha dado novo.
      // Sem isto, o separador Formularios mostra o que a pessoa preencheu mas
      // nao diz porque e que ela nao virou lead: quem la chega ve um cartao
      // sem explicacao. `por` diz o que coincidiu (email, telefone, ou os
      // dois) e `registo` diz com o que coincidiu (lead ou cliente).
      const dedupPor =
        dedupOutcome?.kind === 'MATCH_FORTE'
          ? 'ambos'
          : dedupOutcome?.kind === 'MATCH_EMAIL'
            ? 'email'
            : dedupOutcome?.kind === 'MATCH_TELEFONE'
              ? 'telefone'
              : dedupOutcome?.kind === 'CONFLITO'
                ? 'conflito'
                : null;

      const dedupMeta = dedupPor
        ? {
          kind: dedupOutcome!.kind,
          por: dedupPor,
          registo: existingTarget.targetType,
          // OS VALORES que coincidiram. Dizer "o email e igual" sem dizer qual
          // obriga quem le a ir procurar. Guarda-se so o que bateu: no match
          // por email nao se guarda o telefone, porque esse nao coincidiu.
          ...(dedupPor === 'ambos' || dedupPor === 'email' ? { email_igual: leadEmail ?? null } : {}),
          ...(dedupPor === 'ambos' || dedupPor === 'telefone' ? { telefone_igual: leadPhone ?? null } : {}),
          // 03/05 — a submissao trouxe um telefone ou um email que a ficha nao
          // tem. NUNCA se escreve na ficha da pessoa: fica assinalado aqui, e
          // o separador mostra-o marcado como "nao gravado".
          ...(dedupOutcome?.kind === 'MATCH_EMAIL' && dedupOutcome.novoTelefone
            ? { novo_telefone: dedupOutcome.novoTelefone }
            : {}),
          ...(dedupOutcome?.kind === 'MATCH_TELEFONE' && dedupOutcome.novoEmail
            ? { novo_email: dedupOutcome.novoEmail }
            : {}),
        }
        : null;

      const submissionFieldValues = dedupMeta
        ? { ...fieldValuesWithMeta, _meta: { ...fieldValuesWithMeta._meta, dedup: dedupMeta } }
        : fieldValuesWithMeta;

      // form_submissions' real uniqueness guarantee is an EXPRESSION-based
      // unique index (COALESCE(form_id,...), COALESCE(campaign_id,...)) —
      // the JS client's .upsert({onConflict: '...'}) only supports a bare
      // column list and cannot target it, which made every upsert here 500
      // with "no unique or exclusion constraint matching the ON CONFLICT
      // specification" (confirmed live). upsert_form_submission (migration
      // 20261111250000) does the correct native upsert instead.
      const { data: submissionId, error: submissionError } = await supabase.rpc('upsert_form_submission', {
        p_organization_id: organization_id,
        p_root_organization_id: rootOrgId,
        p_entity_id: entityId,
        p_form_id: canonicalFormId ?? null,
        p_campaign_id: resolvedCampaignId,
        p_target_type: existingTarget.targetType,
        p_target_id: existingTarget.targetId,
        p_field_values: submissionFieldValues,
        p_status: isComplete ? 'complete' : 'in_progress',
        p_is_complete: isComplete,
        p_current_step: currentStep,
        p_total_steps: totalSteps,
      });

      if (submissionError || !submissionId) {
        // `form_submissions.target_type` so passou a aceitar 'lead' na
        // migration 20261116060000. Enquanto ela nao estiver aplicada no
        // remoto, o insert e recusado pelo CHECK — e o visitante NAO pode
        // ficar bloqueado por isso: cai-se no caminho antigo (lead nova, o
        // comportamento de hoje) com o erro bem visivel no log.
        const submissionMessage = submissionError?.message ?? '';
        const targetTypeCheckRejected = existingTarget.targetType === 'lead'
          && (submissionError?.code === '23514' || submissionMessage.includes('form_submissions_target_type_check'));
        if (targetTypeCheckRejected) {
          console.error(
            '[create-lead] form_submissions ainda nao aceita target_type=lead (migration 20261116060000 por aplicar); a criar lead como antes:',
            submissionMessage,
          );
          existingTarget = null;
        } else {
          console.error('Error upserting form_submissions:', submissionError);
          return new Response(
            JSON.stringify({ error: 'Failed to record form submission', details: submissionError?.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      }

      if (existingTarget && submissionId) {
        // CONFLITO (06): a segunda entidade fica marcada na submissao — e essa
        // marca que a manda para a fila de revisao. Best-effort: a coluna pode
        // ainda nao existir no remoto (migration 20261116050000 por aplicar),
        // caso em que o PostgREST devolve PGRST204 e a submissao fica na mesma
        // ligada ao registo existente, apenas sem a marca de conflito.
        if (conflictingEntityId) {
          const { error: conflictError } = await supabase
            .from('form_submissions')
            .update({ conflicting_entity_id: conflictingEntityId })
            .eq('id', submissionId);
          if (conflictError) {
            console.error(
              '[create-lead] nao foi possivel gravar conflicting_entity_id (a coluna pode nao existir ainda; continuando):',
              conflictError.message,
            );
          }
        }

        // A lead sem comercial sobe ao topo: carimba-se `last_activity_at`.
        // Best-effort e DEPOIS da submissao ja estar gravada — falhar aqui so
        // custa a subida na ordenacao, nunca a submissao nem o visitante. A
        // coluna so existe a partir da migration 20261116050000; enquanto ela
        // nao estiver aplicada o PostgREST devolve PGRST204/42703, loga-se e
        // segue. Nada mais na ficha da lead e tocado.
        if (existingTarget.targetType === 'lead' && existingLeadIsUnowned) {
          const { error: activityError } = await supabase
            .from('anew_leads')
            .update({ last_activity_at: new Date().toISOString() })
            .eq('id', existingTarget.targetId);
          if (activityError) {
            console.error(
              '[create-lead] nao foi possivel carimbar last_activity_at (a coluna pode nao existir ainda; continuando):',
              activityError.message,
            );
          }
        }

        // --- Notificacao do comercial (01 a 06) ---
        // So aqui, DEPOIS de a submissao estar mesmo gravada: se o upsert
        // tivesse sido recusado caia-se no caminho antigo (lead nova) e a
        // notificacao seria falsa. Fail-soft: falhar a notificar nunca bloqueia
        // o visitante nem a submissao ja escrita.
        try {
          if (dedupOutcome) {
            const notifyTarget: DedupNotificationTarget = {
              targetType: existingTarget.targetType,
              targetId: existingTarget.targetId,
              assigneeAnewUserId: existingTargetAssigneeAnewUserId,
            };

            // CONFLITO (06): a segunda entidade pode ter OUTRO comercial, e a
            // regra e notificar os dois. E preciso classifica-la para lhe
            // chegar ao responsavel — o `summary` de cima e so o da entidade
            // do email.
            let conflictTarget: DedupNotificationTarget | null = null;
            if (conflictingEntityId) {
              const conflictSummary = await classifyEntityInOrg({
                supabase, entityId: conflictingEntityId, organizationId: organization_id,
              });
              if (conflictSummary.clientId) {
                conflictTarget = {
                  targetType: 'client',
                  targetId: conflictSummary.clientId,
                  assigneeAnewUserId: conflictSummary.clientAssigneeAnewUserId ?? null,
                };
              } else if (conflictSummary.activeLeadId) {
                conflictTarget = {
                  targetType: 'lead',
                  targetId: conflictSummary.activeLeadId,
                  assigneeAnewUserId: conflictSummary.activeLeadAssigneeAnewUserId ?? null,
                };
              }
            }

            await emitDedupSubmissionNotification({
              supabase,
              organizationId: organization_id,
              entityId: entityId as string,
              outcome: dedupOutcome,
              target: notifyTarget,
              conflictTarget,
              submissionId: submissionId as string,
              formId: canonicalFormId ?? null,
              campaignId: resolvedCampaignId,
              displayName: composeDisplayName(leadFirstName, leadLastName) || null,
              formName,
            });
          }
        } catch (notifyErr) {
          console.error('[create-lead] notificacao de submissao associada falhou (continuando):', notifyErr);
        }

        // A RESPOSTA e sempre igual, tenha-se reconhecido a pessoa ou nao.
        //
        // Isto e uma regra de privacidade, nao um detalhe: se aqui saisse
        // 'submission' quando ha match e 'lead' quando nao ha, qualquer pessoa
        // que soubesse o email de outra descobria, submetendo o formulario e
        // olhando para a resposta, se ela e lead ou cliente desta organizacao.
        // Quem esta do lado de fora do formulario nao deve saber nada.
        //
        // O `target_id` continua a ser o id da submissao -- um UUID, que nao
        // revela nada. O update-lead resolve a tabela certa pelo proprio id,
        // sem confiar neste rotulo.
        const wireTargetType = 'lead';

        return new Response(
          JSON.stringify({
            success: true,
            target_type: wireTargetType,
            target_id: submissionId,
            current_step: currentStep,
            total_steps: totalSteps,
            is_complete: isComplete,
            next_step: isComplete ? null : currentStep + 1,
            sanitized: sanitizeReport,
            message: isComplete
              ? 'Form submission recorded successfully'
              : `Step ${currentStep} completed. Continue with update-lead API.`,
          }),
          { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // CONFLITO (06) sem registo existente onde acumular: as duas entidades
    // batem mas nenhuma delas tem lead activa nem e cliente, por isso nao ha
    // linha em form_submissions e a marca de conflito nao tem onde ficar. A
    // invariante manda criar a lead (a entidade escolhida nao tem nenhuma), e
    // o conflito fica so no log. Medido no remoto: 0 a 3 conflitos em 5724
    // leads, e este e um subconjunto desses.
    if (conflictingEntityId && !existingTarget) {
      console.warn(
        '[create-lead] CONFLITO sem registo existente: email->%s, telefone->%s. A criar lead nova; conflito nao vai a fila de revisao.',
        dedupOutcome?.kind === 'CONFLITO' ? dedupOutcome.entityIdEmail : null,
        conflictingEntityId,
      );
    }

    if (!entityId) {
      // L3 + L19: Atomically create entity + emails + phones + addresses + roles
      // via the create_entity_with_contacts_and_roles RPC. Any failure inside
      // the RPC rolls back the entire transaction (no orphan entities/contacts/
      // roles). Address is only included when both street and postal_code are
      // present — never with 'N/A' / '0000-000' placeholders.
      const displayName = composeDisplayName(leadFirstName, leadLastName) || 'Lead';

      const emailsPayload: Array<Record<string, unknown>> = [];
      if (leadEmail) {
        emailsPayload.push({
          email: leadEmail.toLowerCase().trim(),
          email_type: 'personal',
          is_primary: true,
        });
      }

      const phonesPayload: Array<Record<string, unknown>> = [];
      if (leadPhone) {
        phonesPayload.push({
          phone_number: leadPhone,
          phone_type: 'mobile',
          is_primary: true,
        });
      }

      const addressesPayload: Array<Record<string, unknown>> = [];
      const leadAddressRaw = resolveContact('address', 'po_morada', 'morada') || '';
      const leadPostalRaw = resolveContact('postal_code', 'po_codigo_postal', 'codigo_postal') || '';
      const leadCityRaw = resolveContact('city', 'po_localidade', 'localidade', 'cidade') || '';
      const street = String(leadAddressRaw).trim();
      const postal = String(leadPostalRaw).trim();
      const city = String(leadCityRaw).trim();
      // L19: only persist an address when both street AND postal_code are present.
      // Never substitute 'N/A' / '0000-000' placeholders.
      if (street && postal) {
        addressesPayload.push({
          street,
          postal_code: postal,
          city: city || '',
          number: '',
          country: 'PT',
          address_type: 'primary',
          is_primary: true,
        });
      }

      const rolesPayload = [{ role: 'lead', status: 'active', source_type: 'lead' }];

      const entityPayload: Record<string, unknown> = {
        type: 'person',
        status: 'active',
        display_name: displayName,
      };
      if (leadFirstName) entityPayload.first_name = leadFirstName;
      if (leadLastName) entityPayload.last_name = leadLastName;

      // create_entity_with_contacts_and_roles (20260821020000) requires a
      // non-null p_created_by when called as service_role with no auth.uid()
      // (this public, anonymous Edge Function never has one) - resolve an
      // org admin the same way insert-lead already does, or every brand-new
      // lead submission 500s with "Autenticacao necessaria" (confirmed live).
      const entityCreatedBy = await resolveAdminCreatedBy(supabase, rootOrgId);

      const { data: rpcEntityId, error: rpcError } = await supabase.rpc(
        'create_entity_with_contacts_and_roles',
        {
          p_organization_id: organization_id,
          p_entity: entityPayload,
          p_emails: emailsPayload,
          p_phones: phonesPayload,
          p_addresses: addressesPayload,
          p_roles: rolesPayload,
          p_created_by: entityCreatedBy,
        },
      );

      if (rpcError || !rpcEntityId) {
        console.error('Error creating entity via RPC:', rpcError);
        return new Response(
          JSON.stringify({ error: 'Failed to create lead entity', details: rpcError?.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      entityId = rpcEntityId as string;
      entityWasCreated = true;
      console.log('Created new entity (RPC):', entityId);
    }

    // Local idempotent org link — primary only if WE just created the entity.
    if (entityId) {
      await ensureEntityOrgLinkSR({
        supabase, entityId, organizationId: organization_id, isPrimary: !!entityWasCreated,
      });
    }


    // Check if entity already has contact/client roles
    let existingRoles: string[] = [];
    if (entityId) {
      const { data: roles } = await supabase
        .from('anew_entity_roles')
        .select('role, status')
        .eq('entity_id', entityId)
        .eq('organization_id', organization_id)
        .in('role', ['contact', 'client'])
        .eq('status', 'active');
      existingRoles = (roles || []).map(r => r.role);
      if (existingRoles.length > 0) {
        console.log('Entity already has roles:', existingRoles);
      }
    }

    // Resolve source name + source_id before insert
    // AUDIT 03 #1+#2: source_id is internal UUID — accept ONLY if it belongs to org (or NULL/global).
    // utm_source is public text — never overrides a pre-validated source_id, only fills source name.
    // Textual `source` (e.g. "Website" from old snippets) is always preserved.
    let resolvedSource: string = (typeof source === 'string' && source.trim()) ? String(source).trim() : 'public_api';
    let resolvedSourceId: string | null = null;
    let sourceIdLocked = false; // true once a validated source_id is set
    try {
      // 1. Validate explicit source_id (cross-org safety).
      if (incomingSourceId) {
        const { data: sourceData, error: srcErr } = await supabase
          .from('lead_sources')
          .select('id, name, organization_id')
          .eq('id', incomingSourceId)
          .maybeSingle();
        if (sourceData?.id) {
          const okOrg = sourceData.organization_id == null || sourceData.organization_id === organization_id;
          if (okOrg) {
            resolvedSourceId = sourceData.id;
            sourceIdLocked = true;
            if (sourceData.name) resolvedSource = sourceData.name;
            console.log('Resolved source by source_id:', resolvedSource);
          } else {
            console.log('source_id ignored (cross-org):', incomingSourceId);
          }
        } else {
          console.log('source_id lookup failed:', srcErr?.message || 'no row');
        }
      }

      // 2. Textual `source` (legacy/Website, NON-UTM only): keep text, best-effort fill source_id.
      //    For UTM embeds we skip this so we never match the literal "public_form" against a Source name.
      if (
        embedKind !== 'utm' &&
        !sourceIdLocked &&
        typeof source === 'string' &&
        source.trim() &&
        organization_id
      ) {
        const txt = source.trim();
        const { data: matches } = await supabase
          .from('lead_sources')
          .select('id, name, organization_id')
          .eq('is_active', true)
          .ilike('name', txt)
          .or(`organization_id.eq.${organization_id},organization_id.is.null`)
          .limit(10);
        const m = (matches || []).find((s: any) => s.organization_id === organization_id)
          || (matches || []).find((s: any) => s.organization_id == null);
        if (m?.id) {
          resolvedSourceId = m.id;
          // keep textual source as-is (preserves legacy "Website")
          console.log('Best-effort source_id fill from textual source:', txt);
        }
      }

      // 3. utm_source (UTM embed): set textual `source` to the real utm_source value
      //    so the lead reflects "mailchimp"/"google"/"facebook" instead of "public_form".
      //    source_id is intentionally NOT resolved here — canonical resolution happens
      //    in marketingAttribution.ts (channel.source_id → lead_sources.utm_aliases fallback).
      if (embedKind === 'utm' && safeTracking?.utm_source) {
        const utmSrc = String(safeTracking.utm_source).trim();
        if (utmSrc && !sourceIdLocked) {
          resolvedSource = utmSrc;
        }
      }

      // 3b. Click-id + referrer fallback (GA-style, only a resource): when
      // there is no utm_source at all and no already-validated source_id,
      // derive the origin name from the ad-platform click id (gclid ->
      // "Google Ads", fbclid -> the Meta property) and, failing that, from the
      // referrer's domain (e.g. "Instagram") — so the lead reflects reality
      // instead of the generic "public_form" text, and paid is not silently
      // reported as organic.
      // Never overrides an explicit utm_source (step 3, above) or a locked
      // source_id. Unknown domains resolve to null and change nothing.
      // source_id resolution for this candidate happens asynchronously in
      // marketingAttribution.ts (same as the utm_source path above).
      if (embedKind === 'utm' && !sourceIdLocked && !safeTracking?.utm_source) {
        const derivedOrigin = resolveOriginWithoutUtmSource(safeTracking);
        if (derivedOrigin) {
          resolvedSource = derivedOrigin;
          console.log('Resolved source without utm_source:', derivedOrigin);
        }
      }

      // 4. Fallback: campaign_sources.is_default (only if nothing resolved).
      if (!sourceIdLocked && !resolvedSourceId && resolvedSource === 'public_api' && resolvedCampaignId) {
        const { data: defaultCampaignSource } = await supabase
          .from('campaign_sources')
          .select('source_id')
          .eq('campaign_id', resolvedCampaignId)
          .eq('is_default', true)
          .maybeSingle();
        if (defaultCampaignSource?.source_id) {
          const { data: sourceData } = await supabase
            .from('lead_sources')
            .select('id, name, organization_id')
            .eq('id', defaultCampaignSource.source_id)
            .maybeSingle();
          if (sourceData?.name && (sourceData.organization_id == null || sourceData.organization_id === organization_id)) {
            resolvedSource = sourceData.name;
            resolvedSourceId = sourceData.id;
            console.log('Resolved source by campaign default:', resolvedSource);
          }
        }
      }
    } catch (srcError) {
      console.error('Error resolving source:', srcError);
    }

    // Insert lead
    const { data: lead, error: insertError } = await supabase
      .from('anew_leads')
      .insert({
        campaign_id: resolvedCampaignId,
        organization_id,
        root_organization_id: rootOrgId,
        entity_id: entityId,
        field_values: fieldValuesWithMeta,
        source: resolvedSource,
        source_id: resolvedSourceId,
        notes: notes || null,
        tags: tags || null,
        status: isComplete ? 'new' : 'incomplete',
        needs_manual_scheduling: !!needs_manual_scheduling,
        locale: leadLocale,
        created_by: null // Public API, no user
      })
      .select("id, campaign_id, organization_id, root_organization_id, field_values, status, source, source_id, created_at")
      .single();

    if (insertError) {
      console.error('Error inserting lead:', insertError);

      // L3 — Compensation cleanup: the RPC successfully created the entity +
      // contacts + roles, but the lead insert failed. Child tables do NOT have
      // ON DELETE CASCADE to anew_entities, so we must clean up explicitly in
      // FK-safe order. Only do this when WE created the entity (not when we
      // reused a pre-existing one via dedup).
      if (entityWasCreated && entityId) {
        try {
          await cleanupCreatedEntityArtifacts(supabase, entityId);
          console.log('Compensation cleanup completed for entity:', entityId);
        } catch (cleanupErr) {
          console.error('Compensation cleanup failed (manual review needed):', cleanupErr, 'entity_id:', entityId);
        }
      }

      return new Response(
        JSON.stringify({ error: 'Failed to create lead', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Marketing attribution — only for UTM-integrated leads. Fail-soft.
    try {
      if (lead?.campaign_id && lead?.id && embedKind === "utm") {
        await runMarketingAttribution({
          supabase,
          anewLeadId: lead.id,
          campaignId: lead.campaign_id,
          tracking: safeTracking,
          contactName: composeDisplayName(leadFirstName, leadLastName) || null,
          leadStatus: lead.status,
        });
      }
    } catch (attrErr) {
      console.error("[attribution] outer guard", attrErr);
    }

    // Post-completion emails (per-form options). Fail-soft — never let an
    // email problem break the lead-creation response. Confirmation is
    // skipped for forms with a scheduling step; book-slot sends its own
    // richer confirmation for those instead.
    if (isComplete && form_id && lead?.id && leadEmail) {
      try {
        const { data: schedulingStepCheck } = await supabase
          .from('form_steps')
          .select('id')
          .eq('form_id', form_id)
          .eq('step_type', 'scheduling')
          .limit(1)
          .maybeSingle();
        const leadName = composeDisplayName(leadFirstName, leadLastName) || '';

        if (!schedulingStepCheck) {
          await sendLeadConfirmationEmail(supabase, {
            organizationId: organization_id,
            formId: form_id,
            leadEmail,
            leadName,
            leadPhone,
            leadLocale,
          });
        } else if (needs_manual_scheduling) {
          await queueSchedulingInviteRecovery(supabase, {
            organizationId: organization_id,
            formId: form_id,
            leadId: lead.id,
            leadName,
            leadEmail,
            leadLocale,
            fieldValues: lead.field_values || field_values || {},
            needsManualScheduling: true,
          });
        }
      } catch (emailErr) {
        console.error('[create-lead] post-completion email failed (non-fatal):', emailErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: lead.id,
        target_type: 'lead',
        target_id: lead.id,
        current_step: currentStep,
        total_steps: totalSteps,
        is_complete: isComplete,
        next_step: isComplete ? null : currentStep + 1,
        lead: {
          id: lead.id,
          campaign_id: lead.campaign_id,
          organization_id: lead.organization_id,
          root_organization_id: lead.root_organization_id,
          field_values: lead.field_values,
          status: lead.status,
          source: lead.source,
          created_at: lead.created_at
        },
        sanitized: sanitizeReport,
        message: isComplete ? 'Lead created successfully' : `Step ${currentStep} completed. Continue with update-lead API.`
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in create-lead:', error);
    await captureError(error, { function: "create-lead" });
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
