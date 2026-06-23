import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { z } from "npm:zod";
import { composeDisplayName, normalizeFirstLast } from '../_shared/composeDisplayName.ts';

const requestSchema = z.object({
  first_name: z.string(),
  last_name: z.string(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
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
});
import { sanitizeEmail, sanitizePhone, sanitizeFieldValues } from '../_shared/inputSanitizers.ts';
import {
  cleanupCreatedEntityArtifacts,
  resolveRootOrganizationId,
  validateInsertLeadCampaign,
} from '../_shared/leadsValidation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

interface LeadData {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  vat?: string;
  position?: string;
  organization_id?: string;
  notes?: string;
  source?: string;
  source_id?: string;
  campaign_id?: string;
  status?: string;
  custom_fields?: Record<string, string>;
  auto_schedule?: boolean;
  schedule_options?: {
    board_id?: string;
    title?: string;
    description?: string;
    duration_minutes?: number;
    preferred_date?: string;
    preferred_time_start?: string;
    preferred_time_end?: string;
    preferred_resource_ids?: string[];
    priority?: number;
    tags?: string[];
    use_proximity?: boolean;
  };
  location?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}

interface AutoScheduleResult {
  success: boolean;
  item_id?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  assigned_resources?: string[];
  resource_details?: {
    id: string;
    name: string;
    distance_km?: number;
    travel_time_minutes?: number;
  }[];
  message?: string;
  error?: string;
}

// --- Rate limiting by API key (10 req/min) ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW = 60_000;

function checkRateLimit(key: string): Response | null {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (entry && now < entry.resetAt) {
    entry.count++;
    if (entry.count > RATE_LIMIT) {
      return new Response(
        JSON.stringify({ error: 'Too many requests' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } }
      );
    }
  } else {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW });
  }
  // Cleanup old entries
  if (rateLimitMap.size > 10000) {
    for (const [k, v] of rateLimitMap) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
  }
  return null;
}

// --- Input validation ---
function validateFieldValues(fields: Record<string, any>): string | null {
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string' && value.length > 10000) {
      return `Field "${key}" exceeds max length (10000 chars)`;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = req.headers.get('x-api-key');
    
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key is required. Use X-API-Key header.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limit by API key
    const rateLimitResponse = checkRateLimit(apiKey);
    if (rateLimitResponse) return rateLimitResponse;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate API token against scoped_api_tokens using organization_id
    const { data: scopedToken, error: scopedError } = await supabase
      .from('scoped_api_tokens')
      .select('id, organization_id, is_active, usage_count')
      .eq('token_key', apiKey)
      .eq('is_active', true)
      .single();

    if (scopedError || !scopedToken) {
      return new Response(
        JSON.stringify({ error: 'Invalid or inactive API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const organizationId = scopedToken.organization_id;
    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: 'API token has no organization_id configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update token usage
    await supabase
      .from('scoped_api_tokens')
      .update({ last_used_at: new Date().toISOString(), usage_count: (scopedToken.usage_count || 0) + 1 })
      .eq('id', scopedToken.id);

    // Parse lead data
    const rawBody = await req.json();
    const parsedBody = requestSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: parsedBody.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const leadData: LeadData = parsedBody.data;

    // Log metadata only — no PII (C28)
    console.log('Received insert-lead request:', JSON.stringify({
      source: leadData.source,
      campaign_id: leadData.campaign_id,
      organization_id: organizationId,
      has_schedule: !!leadData.auto_schedule,
      has_custom_fields: !!leadData.custom_fields,
      field_count: leadData.custom_fields ? Object.keys(leadData.custom_fields).length : 0,
    }));

    // Validate custom_fields size (C29)
    if (leadData.custom_fields) {
      const validationError = validateFieldValues(leadData.custom_fields);
      if (validationError) {
        return new Response(
          JSON.stringify({ error: validationError }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (leadData.campaign_id) {
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .select('id, organization_id, status')
        .eq('id', leadData.campaign_id)
        .maybeSingle();

      if (campaignError && !campaign) {
        return new Response(
          JSON.stringify({ error: 'Campaign not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const campaignValidation = validateInsertLeadCampaign(organizationId, campaign);
      if (!campaignValidation.ok) {
        return new Response(
          JSON.stringify({
            error: campaignValidation.error,
            ...(campaignValidation.details ? campaignValidation.details : {}),
          }),
          { status: campaignValidation.status || 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const rootOrganizationId = await resolveRootOrganizationId(supabase, organizationId) || organizationId;

    // Find an admin user for created_by via anew_memberships
    const { data: adminMembership } = await supabase
      .from('anew_memberships')
      .select('user_id, anew_roles!inner(code)')
      .eq('organization_id', rootOrganizationId)
      .eq('status', 'active')
      .in('anew_roles.code', ['super_admin', 'admin', 'org_admin'])
      .limit(1)
      .maybeSingle();

    const createdBy = adminMembership?.user_id || null;

    // Build field_values JSONB from lead data
    // Normalize first/last name to defend against integrations that send the
    // full name in BOTH fields (e.g. META Lead Ads).
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

    // Merge custom fields into field_values
    if (leadData.custom_fields) {
      Object.entries(leadData.custom_fields).forEach(([key, value]) => {
        fieldValues[key] = value;
      });
    }

    // Validate merged field_values
    const mergedValidation = validateFieldValues(fieldValues);
    if (mergedValidation) {
      return new Response(
        JSON.stringify({ error: mergedValidation }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Defensive sanitization. Rejects corrupted emails/phones, dedupes
    // arrays, trims string fields. Runs after the static validateFieldValues
    // size check so we don't mask oversized inputs.
    const _sanitizeResult = sanitizeFieldValues(fieldValues);
    Object.assign(fieldValues, _sanitizeResult.cleaned);
    const sanitizeReport = _sanitizeResult.report;
    if (sanitizeReport.email_rejected) {
      console.warn(`[insert-lead] rejected invalid email "${sanitizeReport.email_rejected}"`);
    }
    if (sanitizeReport.phone_rejected) {
      console.warn(`[insert-lead] rejected invalid phone "${sanitizeReport.phone_rejected}"`);
    }

    // Build full location string
    const fullLocation = [leadData.address, leadData.postal_code, leadData.city]
      .filter(Boolean)
      .join(', ') || leadData.location;

    // --- Entity deduplication: reuse existing entity if email matches ---
    let entityId: string | null = null;
    let entityWasCreated = false;
    const rawEmail = leadData.email || fieldValues.email || null;
    const rawPhone = leadData.phone || fieldValues.phone || null;
    const leadEmail = sanitizeEmail(rawEmail);
    const leadPhone = sanitizePhone(rawPhone);
    const leadFirstName = normalizedNames.first || '';
    const leadLastName = normalizedNames.last || '';

    // Local-scoped lookup ONLY within organizationId — never silently shares cross-org identity.
    const { findLocalEntityForOrg, classifyEntityInOrg, emitFormResubmissionAlert, mergeFieldValuesNonDestructive, ensureEntityOrgLinkSR } =
      await import('../_shared/entityScopedLookup.ts');
    const scopedHit = await findLocalEntityForOrg({
      supabase, organizationId, email: leadEmail, phone: leadPhone, nif: null,
    });
    if (scopedHit?.entityId) {
      entityId = scopedHit.entityId;
      const summary = await classifyEntityInOrg({ supabase, entityId, organizationId });
      if (summary.targetType && summary.targetId) {
        const targetTable = summary.targetType === 'lead' ? 'anew_leads' : summary.targetType === 'contact' ? 'anew_contacts' : 'anew_clients';
        const diff = await mergeFieldValuesNonDestructive({
          supabase, table: targetTable as any, rowId: summary.targetId, newFieldValues: fieldValues,
        });
        const notificationId = await emitFormResubmissionAlert({
          supabase, organizationId, entityId, summary,
          campaignId: leadData.campaign_id || null, formId: null, fieldValuesDiff: diff,
          displayName: composeDisplayName(leadFirstName, leadLastName) || null,
        });
        return new Response(JSON.stringify({
          success: true, outcome: `alert_existing_${summary.targetType}`,
          entity_id: entityId, target_type: summary.targetType, target_id: summary.targetId,
          notification_id: notificationId, sanitized: sanitizeReport,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      console.log('[insert-lead] reusing local entity', entityId);
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
      const street = String(leadData.address || '').trim();
      const postalCode = String(leadData.postal_code || '').trim();
      const city = String(leadData.city || '').trim();
      if (street && postalCode) {
        addressesPayload.push({
          street,
          postal_code: postalCode,
          city: city || '',
          number: '',
          country: 'PT',
          address_type: 'primary',
          is_primary: true,
        });
      }

      const entityPayload: Record<string, unknown> = {
        display_name: displayName,
        type: 'person',
        status: 'active',
      };
      if (leadFirstName) entityPayload.first_name = leadFirstName;
      if (leadLastName) entityPayload.last_name = leadLastName;

      const { data: rpcEntityId, error: entityError } = await supabase.rpc(
        'create_entity_with_contacts_and_roles',
        {
          p_organization_id: organizationId,
          p_entity: entityPayload,
          p_emails: emailsPayload,
          p_phones: phonesPayload,
          p_addresses: addressesPayload,
          p_roles: [{ role: 'lead', status: 'active', source_type: 'lead' }],
          p_created_by: createdBy,
        },
      );

      if (entityError || !rpcEntityId) {
        console.error('Error creating entity via RPC:', entityError);
        return new Response(
          JSON.stringify({ error: 'Failed to create lead entity', details: entityError?.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      entityId = rpcEntityId as string;
      entityWasCreated = true;
      console.log('Created new entity (RPC):', entityId);
    }

    if (entityId) {
      await ensureEntityOrgLinkSR({ supabase, entityId, organizationId, isPrimary: entityWasCreated });
    }

    // Check existing roles on entity
    let existingRoles: string[] = [];
    if (entityId) {
      const { data: roles } = await supabase
        .from('anew_entity_roles')
        .select('role, status')
        .eq('entity_id', entityId)
        .in('role', ['contact', 'client'])
        .eq('status', 'active');
      existingRoles = (roles || []).map((r: any) => r.role);
      if (existingRoles.length > 0) {
        console.log('Entity already has roles:', existingRoles);
      }
    }

    // Insert into anew_leads
    const { data: lead, error: insertError } = await supabase
      .from('anew_leads')
      .insert({
        organization_id: organizationId,
        root_organization_id: rootOrganizationId,
        entity_id: entityId,
        field_values: fieldValues,
        source: leadData.source || 'API',
        status: leadData.status || 'new',
        campaign_id: leadData.campaign_id || null,
        created_by: createdBy,
        assigned_to: null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting lead:', insertError);
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

    console.log('Lead created successfully:', lead.id);

    // Handle auto-scheduling if enabled
    let scheduleResult: AutoScheduleResult | null = null;
    
    if (leadData.auto_schedule) {
      console.log('Auto-scheduling enabled, calling auto-schedule function...');
      
      const scheduleOptions = leadData.schedule_options || {};
      
      const scheduleRequest = {
        title: scheduleOptions.title || `Visita - ${leadData.first_name} ${leadData.last_name}`,
        description: scheduleOptions.description || leadData.notes,
        lead_id: lead.id,
        location: fullLocation,
        postal_code: leadData.postal_code,
        duration_minutes: scheduleOptions.duration_minutes || 60,
        preferred_date: scheduleOptions.preferred_date,
        preferred_time_start: scheduleOptions.preferred_time_start,
        preferred_time_end: scheduleOptions.preferred_time_end,
        preferred_resource_ids: scheduleOptions.preferred_resource_ids,
        priority: scheduleOptions.priority,
        tags: scheduleOptions.tags,
        board_id: scheduleOptions.board_id,
        organization_id: organizationId,
        auto_assign: true,
        use_proximity: scheduleOptions.use_proximity !== false && !!leadData.postal_code
      };

      try {
        const scheduleResponse = await fetch(
          `${supabaseUrl}/functions/v1/auto-schedule`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'x-internal-source': 'insert-lead'
            },
            body: JSON.stringify(scheduleRequest)
          }
        );

        scheduleResult = await scheduleResponse.json();
        console.log('Schedule result:', JSON.stringify({ success: scheduleResult?.success, item_id: scheduleResult?.item_id }));

        if (scheduleResult?.success && scheduleResult.scheduled_start) {
          await supabase
            .from('anew_leads')
            .update({
              callback_scheduled_at: scheduleResult.scheduled_start,
              status: 'scheduled',
            })
            .eq('id', lead.id);

          console.log('Lead updated with scheduled visit');
        }
      } catch (scheduleError) {
        console.error('Error calling auto-schedule:', scheduleError);
        scheduleResult = {
          success: false,
          error: scheduleError instanceof Error ? scheduleError.message : 'Failed to auto-schedule'
        };
      }
    }

    // Build response
    const response: any = { 
      success: true, 
      lead_id: lead.id,
      entity_id: entityId,
      existing_roles: existingRoles.length > 0 ? existingRoles : undefined,
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
        longitude: leadData.longitude
      };
    }

    if (leadData.auto_schedule) {
      response.schedule = scheduleResult;
      if (scheduleResult?.success) {
        response.message = 'Lead created and visit scheduled successfully';
      } else {
        response.message = 'Lead created but scheduling failed: ' + (scheduleResult?.error || 'Unknown error');
      }
    }

    return new Response(
      JSON.stringify(response),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in insert-lead function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
