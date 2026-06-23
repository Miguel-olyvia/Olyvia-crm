import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { z } from "npm:zod";
import { sanitizeTracking } from '../_shared/leadTracking.ts';

const requestSchema = z.object({
  campaign_id: z.string().uuid(),
  form_id: z.string().optional(),
  business_unit_id: z.string().optional(),
  step_number: z.number().optional(),
  field_values: z.record(z.unknown()).optional(),
  source: z.string().optional(),
  source_id: z.string().optional(),
  sourceId: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  from_chat_widget: z.boolean().optional(),
  tracking: z.record(z.unknown()).optional(),
  embed: z.string().optional(),
});
import { runMarketingAttribution } from '../_shared/marketingAttribution.ts';
import { composeDisplayName, normalizeFirstLast } from '../_shared/composeDisplayName.ts';
import {
  findLocalEntityForOrg,
  classifyEntityInOrg,
  emitFormResubmissionAlert,
  mergeFieldValuesNonDestructive,
  ensureEntityOrgLinkSR,
} from '../_shared/entityScopedLookup.ts';
import {
  sanitizeEmail,
  sanitizePhone,
  sanitizeFieldValues,
} from '../_shared/inputSanitizers.ts';
import {
  cleanupCreatedEntityArtifacts,
  resolveCanonicalFormId,
  resolveRootOrganizationId,
} from '../_shared/leadsValidation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
};

// --- Rate Limiting (in-memory, per-isolate) ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;       // max requests per window
const RATE_WINDOW = 60_000;  // 60 seconds

function checkRateLimit(req: Request): Response | null {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    'unknown';
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (entry && now < entry.resetAt) {
    entry.count++;
    if (entry.count > RATE_LIMIT) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } }
      );
    }
  } else {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
  }

  // Cleanup stale entries when map grows large
  if (rateLimitMap.size > 10_000) {
    for (const [k, v] of rateLimitMap) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
  }

  return null; // not rate-limited
}

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
 * - lead_id: for subsequent update-lead calls
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

  // Rate limiting check
  const rateLimitResponse = checkRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    const { campaign_id, form_id, business_unit_id, step_number, field_values, source, notes, tags, from_chat_widget, tracking, embed } = parsedBody.data;
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

    // Get campaign and its company
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, name, organization_id, status, form_id')
      .eq('id', campaign_id)
      .single();

    if (campaignError || !campaign) {
      return new Response(
        JSON.stringify({ error: 'Campaign not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if campaign is active
    if (campaign.status !== 'active') {
      return new Response(
        JSON.stringify({ error: 'Campaign is not active', status: campaign.status }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const organization_id = campaign.organization_id;
    const canonicalForm = resolveCanonicalFormId(form_id, campaign.form_id);
    if (canonicalForm.error) {
      return new Response(
        JSON.stringify({ error: canonicalForm.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const canonicalFormId = canonicalForm.formId;

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

    if (canonicalFormId) {
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
      // Fallback: use campaign-level tables
      const { data: stepsData } = await supabase
        .from('campaign_form_steps')
        .select('step_number')
        .eq('campaign_id', campaign_id)
        .order('step_number', { ascending: false })
        .limit(1);
      totalSteps = stepsData?.[0]?.step_number || 1;

      const { data: fieldDefs, error: fieldDefsError } = await supabase
        .from('lead_field_definitions')
        .select('*')
        .eq('campaign_id', campaign_id)
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
        const { data: existing } = await supabase
          .from('anew_leads')
          .select('id')
          .eq('campaign_id', campaign_id)
          .filter('field_values->>'+def.field_key, 'eq', value)
          .maybeSingle();

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

    // --- Local-scoped entity lookup (form receiving org ONLY) ---
    // Cross-org identity is intentionally ignored: another org's entity is
    // never silently shared into this org by the public form. Manual UI is
    // the only path that can opt-in to cross-org sharing.
    const scopedHit = await findLocalEntityForOrg({
      supabase,
      organizationId: organization_id,
      email: leadEmail,
      phone: leadPhone,
      nif: rawVat,
    });

    if (scopedHit?.entityId) {
      entityId = scopedHit.entityId;
      console.log('[create-lead] reusing local entity via', scopedHit.matchField, entityId);

      // Classify entity in the receiving org. If it is already a contact /
      // client / has an active lead, emit an internal alert for the responsible
      // commercial and merge new field values into the existing record — but
      // NEVER block the visitor: the multi-step form must flow exactly like a
      // new entity (create-lead -> update-lead -> success). A new
      // anew_leads row will still be created below, anchored to this entityId.
      try {
        const summary = await classifyEntityInOrg({ supabase, entityId, organizationId: organization_id });
        if (summary.targetType && summary.targetId) {
          const targetTable =
            summary.targetType === 'lead' ? 'anew_leads' :
            summary.targetType === 'contact' ? 'anew_contacts' : 'anew_clients';
          const diff = await mergeFieldValuesNonDestructive({
            supabase, table: targetTable as any, rowId: summary.targetId, newFieldValues: fieldValuesWithMeta,
          });
          await emitFormResubmissionAlert({
            supabase,
            organizationId: organization_id,
            entityId,
            summary,
            campaignId: campaign_id ?? null,
            formId: canonicalFormId ?? null,
            fieldValuesDiff: diff,
            displayName: composeDisplayName(leadFirstName, leadLastName) || null,
          });
        }
      } catch (alertErr) {
        console.error('[create-lead] duplicate-entity alert side-effect failed (continuing):', alertErr);
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

      const { data: rpcEntityId, error: rpcError } = await supabase.rpc(
        'create_entity_with_contacts_and_roles',
        {
          p_organization_id: organization_id,
          p_entity: entityPayload,
          p_emails: emailsPayload,
          p_phones: phonesPayload,
          p_addresses: addressesPayload,
          p_roles: rolesPayload,
          p_created_by: null,
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


      // 4. Fallback: campaign_sources.is_default (only if nothing resolved).
      if (!sourceIdLocked && !resolvedSourceId && resolvedSource === 'public_api' && campaign_id) {
        const { data: defaultCampaignSource } = await supabase
          .from('campaign_sources')
          .select('source_id')
          .eq('campaign_id', campaign_id)
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
        campaign_id,
        organization_id,
        root_organization_id: rootOrgId,
        entity_id: entityId,
        field_values: fieldValuesWithMeta,
        source: resolvedSource,
        source_id: resolvedSourceId,
        notes: notes || null,
        tags: tags || null,
        status: isComplete ? 'new' : 'incomplete',
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

    return new Response(
      JSON.stringify({ 
        success: true, 
        lead_id: lead.id,
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
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
