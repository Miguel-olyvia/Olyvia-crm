import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { z } from "npm:zod";
import { sanitizeTracking } from "../_shared/leadTracking.ts";

const requestSchema = z.object({
  lead_id: z.string().uuid(),
  campaign_id: z.string().uuid(),
  step_number: z.number().optional(),
  field_values: z.record(z.unknown()),
  from_chat_widget: z.boolean().optional(),
  form_id: z.string().optional(),
  tracking: z.record(z.unknown()).optional(),
});
import { normalizeFirstLast } from "../_shared/composeDisplayName.ts";
import { runMarketingAttribution } from "../_shared/marketingAttribution.ts";
import { sanitizeFieldValues } from "../_shared/inputSanitizers.ts";
import { resolveCanonicalFormId } from "../_shared/leadsValidation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
};

// --- Rate Limiting (in-memory, per-isolate) ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;       // max requests per window
const RATE_WINDOW = 60_000;  // 60 seconds

function checkRateLimit(req: Request): Response | null {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (entry && now < entry.resetAt) {
    entry.count++;
    if (entry.count > RATE_LIMIT) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } }
      );
    }
  } else {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
  }

  if (rateLimitMap.size > 10_000) {
    for (const [k, v] of rateLimitMap) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
  }

  return null;
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
 * Update Lead API
 * 
 * PUBLIC endpoint - Updates an existing lead with new field values
 * Used for multi-step forms to continue adding data after initial creation
 * 
 * PATCH /update-lead
 * Body: { lead_id, campaign_id, step_number, field_values, form_id?, from_chat_widget? }
 *
 * SECURITY: campaign_id is REQUIRED and must match the lead's campaign_id.
 * This is defense-in-depth on a public (no-auth) endpoint: it forces callers
 * to know the (lead_id, campaign_id) pair, preventing enumeration via lead UUID alone.
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "PATCH" && req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use PATCH or POST" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Rate limiting check
  const rateLimitResponse = checkRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { lead_id, campaign_id, step_number, field_values, from_chat_widget, form_id, tracking } = parsed.data;

    // Safe logging — no PII
    console.log("Received update-lead request:", JSON.stringify({ lead_id, campaign_id, step_number, from_chat_widget, field_count: Object.keys(field_values || {}).length }));

    // Validate field value sizes
    const fieldValidationError = validateFieldValues(field_values);
    if (fieldValidationError) {
      return new Response(
        JSON.stringify({ error: fieldValidationError }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get existing lead
    const { data: existingLead, error: leadError } = await supabase
      .from("anew_leads")
      .select("*, campaigns!anew_leads_campaign_id_fkey(id, organization_id, status, form_id)")
      .eq("id", lead_id)
      .single();

    if (leadError || !existingLead) {
      console.error("Lead not found:", leadError);
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: validate that the provided campaign_id matches the lead's campaign_id.
    // This prevents updating arbitrary leads by guessing a single UUID on a public endpoint.
    if (existingLead.campaign_id !== campaign_id) {
      console.warn("update-lead campaign mismatch attempt:", JSON.stringify({
        lead_id,
        provided_campaign_id: campaign_id,
        actual_campaign_id: existingLead.campaign_id,
      }));
      return new Response(
        JSON.stringify({ error: "Forbidden: campaign_id does not match lead" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const campaignId = existingLead.campaign_id;
    const campaignFormId = existingLead.campaigns?.form_id ?? null;
    const canonicalForm = resolveCanonicalFormId(form_id, campaignFormId);
    if (canonicalForm.error) {
      return new Response(
        JSON.stringify({ error: canonicalForm.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const canonicalFormId = canonicalForm.formId;

    // Get field definitions and total steps
    // Priority: form_id (form_steps/form_fields) > campaign_id (campaign_form_steps/lead_field_definitions)
    let definitions: any[] = [];
    let totalSteps = 1;

    if (canonicalFormId) {
      const { data: formFieldDefs } = await supabase
        .from("form_fields")
        .select("*")
        .eq("form_id", canonicalFormId)
        .eq("is_active", true);
      definitions = formFieldDefs || [];

      const { data: formStepsData } = await supabase
        .from("form_steps")
        .select("step_number")
        .eq("form_id", canonicalFormId)
        .order("step_number", { ascending: false })
        .limit(1);
      totalSteps = formStepsData?.[0]?.step_number || 1;
      console.log("Using form-level steps/fields. form_id:", canonicalFormId, "totalSteps:", totalSteps);
    } else {
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
      totalSteps = totalStepsData?.[0]?.step_number || 1;
      console.log("Using campaign-level steps/fields. campaign_id:", campaignId, "totalSteps:", totalSteps);
    }

    // --- Defensive sanitization of incoming field_values BEFORE merge and
    // any validation. Rejects corrupted emails/phones and dedupes arrays.
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
      console.warn(`[update-lead] rejected invalid email "${sanitizeReport.email_rejected}"`);
    }
    if (sanitizeReport.phone_rejected) {
      console.warn(`[update-lead] rejected invalid phone "${sanitizeReport.phone_rejected}"`);
    }

    // Validate required fields for the current step (skip for chat widget)
    const currentStep = step_number || (existingLead.field_values?._meta?.current_step || 1) + 1;
    const currentStepFields = definitions.filter(
      (f: any) => f.step_number === currentStep
    );

    // Skip required field validation for chat widget (it collects fields in any order)
    if (!from_chat_widget) {
      const missingRequired: string[] = [];
      for (const field of currentStepFields) {
        if (field.is_required && !field_values[field.field_key]) {
          missingRequired.push(field.field_label);
        }
      }

      if (missingRequired.length > 0) {
        return new Response(
          JSON.stringify({ 
            error: "Missing required fields", 
            missing_fields: missingRequired 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Check for unique fields
    // L4: use the JSON `->>` text-extraction operator instead of `.contains()`.
    // `.contains()` requires JSONB containment, which silently mis-handles
    // numeric/boolean values stored as JSON literals. `->>` always extracts as
    // text, so casting the candidate to String() gives a reliable equality check
    // regardless of the field's underlying JSON type.
    for (const field of currentStepFields) {
      if (field.is_unique && field_values[field.field_key] !== undefined && field_values[field.field_key] !== null && field_values[field.field_key] !== "") {
        const candidate = String(field_values[field.field_key]);
        const { data: existingLeads } = await supabase
          .from("anew_leads")
          .select("id")
          .eq("campaign_id", campaignId)
          .neq("id", lead_id)
          .filter(`field_values->>${field.field_key}`, "eq", candidate);

        if (existingLeads && existingLeads.length > 0) {
          return new Response(
            JSON.stringify({
              error: `Duplicate value for unique field: ${field.field_label}`,
              field_key: field.field_key,
            }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    const isComplete = currentStep >= totalSteps;

    // Merge existing field_values with new ones
    const existingFieldValues = existingLead.field_values || {};
    const { _meta: existingMeta, ...existingFields } = existingFieldValues;

    // Optional, additive: never overwrite an already-recorded tracking object.
    // Only set tracking when (a) it's missing and (b) the caller provided a valid one.
    const safeTracking = sanitizeTracking(tracking);
    const preservedTracking = existingMeta?.tracking
      ? existingMeta.tracking
      : (safeTracking || undefined);

    const updatedFieldValues = {
      ...existingFields,
      ...field_values,
      _meta: {
        ...existingMeta,
        current_step: currentStep,
        total_steps: totalSteps,
        is_complete: isComplete,
        last_updated: new Date().toISOString(),
        steps_completed: [...(existingMeta?.steps_completed || []), currentStep].filter(
          (v: number, i: number, a: number[]) => a.indexOf(v) === i
        ).sort((a: number, b: number) => a - b),
        ...(preservedTracking ? { tracking: preservedTracking } : {}),
      }
    };

    // Update entity first_name/last_name if name fields are present in this step
    if (existingLead.entity_id) {
      const nameAliases = {
        first_name: ['first_name', 'po_nome', 'nome', 'name'],
        last_name: ['last_name', 'po_apelido', 'apelido', 'surname'],
      };
      let firstName: string | null = null;
      let lastName: string | null = null;
      for (const alias of nameAliases.first_name) {
        if (field_values[alias]) { firstName = field_values[alias]; break; }
      }
      for (const alias of nameAliases.last_name) {
        if (field_values[alias]) { lastName = field_values[alias]; break; }
      }
      if (firstName || lastName) {
        // Defend against integrations that send the full name in BOTH fields.
        const normalized = normalizeFirstLast(firstName, lastName);
        const { data: currentEntity } = await supabase
          .from("anew_entities")
          .select("first_name, last_name")
          .eq("id", existingLead.entity_id)
          .single();
        if (currentEntity) {
          const nameUpdate: Record<string, any> = {};
          if (normalized.first && !currentEntity.first_name) nameUpdate.first_name = normalized.first;
          if (normalized.last && !currentEntity.last_name) nameUpdate.last_name = normalized.last;
          if (Object.keys(nameUpdate).length > 0) {
            await supabase.from("anew_entities").update(nameUpdate).eq("id", existingLead.entity_id);
            console.log("Updated entity names:", nameUpdate);
          }
        }
      }
    }

    // Update the lead
    const { error: updateError } = await supabase
      .from("anew_leads")
      .update({
        field_values: updatedFieldValues,
        status: isComplete ? "new" : "incomplete",
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead_id);

    if (updateError) {
      console.error("Error updating lead:", updateError);
      return new Response(
        JSON.stringify({ error: "Error updating lead", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Lead updated successfully:", lead_id);

    // Marketing attribution — idempotente, fail-soft.
    // Só corre quando há campaign_id e tracking UTM efectivo (não basta haver campaign_id).
    try {
      const effectiveTracking: any =
        (preservedTracking && typeof preservedTracking === 'object' ? preservedTracking : null) ||
        (safeTracking && typeof safeTracking === 'object' ? safeTracking : null);

      const hasEffectiveUtmTracking = !!effectiveTracking && (
        effectiveTracking.embed === 'utm' ||
        !!effectiveTracking.utm_source ||
        !!effectiveTracking.gclid ||
        !!effectiveTracking.fbclid ||
        !!effectiveTracking.msclkid
      );

      if (existingLead.campaign_id && hasEffectiveUtmTracking) {
        await runMarketingAttribution({
          supabase,
          anewLeadId: lead_id,
          campaignId: existingLead.campaign_id,
          tracking: effectiveTracking,
          contactName: null,
          leadStatus: isComplete ? 'new' : 'incomplete',
        });
      }
    } catch (attrErr) {
      console.error("[attribution] update-lead outer guard", attrErr);
    }


    return new Response(
      JSON.stringify({
        success: true,
        lead_id,
        current_step: currentStep,
        total_steps: totalSteps,
        is_complete: isComplete,
        next_step: isComplete ? null : currentStep + 1,
        steps_completed: updatedFieldValues._meta.steps_completed,
        sanitized: sanitizeReport,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in update-lead:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
