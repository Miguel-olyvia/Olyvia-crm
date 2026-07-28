import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { z } from "npm:zod";
import { sanitizeTracking } from "../_shared/leadTracking.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, getClientIp, rateLimitResponse, recordRateLimitAttempt } from "../_shared/rateLimit.ts";

initSentry();

const requestSchema = z.object({
  lead_id: z.string().uuid().optional(),
  target_type: z.enum(["lead", "contact", "client"]).optional(),
  target_id: z.string().uuid().optional(),
  campaign_id: z.string().uuid(),
  step_number: z.number().optional(),
  field_values: z.record(z.unknown()),
  from_chat_widget: z.boolean().optional(),
  form_id: z.string().optional(),
  tracking: z.record(z.unknown()).optional(),
  needs_manual_scheduling: z.boolean().optional(),
  lang: z.string().optional(),
}).refine(
  (v) => !!v.lead_id || !!v.target_id,
  { message: "Either lead_id or target_id must be provided" },
);
import { normalizeFirstLast, composeDisplayName } from "../_shared/composeDisplayName.ts";
import { runMarketingAttribution } from "../_shared/marketingAttribution.ts";
import { sanitizeFieldValues, sanitizeEmail } from "../_shared/inputSanitizers.ts";
import { sendLeadConfirmationEmail, queueSchedulingInviteRecovery } from "../_shared/formEmails.ts";
import { resolveCanonicalFormId, validateLocationDistrict } from "../_shared/leadsValidation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
};

const RATE_LIMIT_BUCKET = "update-lead";
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

/**
 * Update Lead API
 * 
 * PUBLIC endpoint - Updates an existing lead with new field values
 * Used for multi-step forms to continue adding data after initial creation
 * 
 * PATCH /update-lead
 * Body: { target_type?, target_id?, lead_id?, campaign_id, step_number, field_values, form_id?, from_chat_widget? }
 *
 * Polymorphic on target_type ("lead" | "contact" | "client"):
 * - "lead" (default, or inferred from a bare lead_id for backwards
 *   compatibility with already-deployed frontends): updates anew_leads as before.
 * - "contact" | "client": updates the form_submissions row (by its own id,
 *   passed as target_id) instead — never writes to anew_leads/anew_contacts/
 *   anew_clients. The one-time non-destructive custom_fields merge into the
 *   contact/client already happened in create-lead's step 1 classification.
 *
 * SECURITY: campaign_id is REQUIRED and must match the target row's campaign_id.
 * This is defense-in-depth on a public (no-auth) endpoint: it forces callers
 * to know the (target_id, campaign_id) pair, preventing enumeration via UUID alone.
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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Rate limiting check — persistent, DB-backed
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
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { lead_id, campaign_id, step_number, field_values, from_chat_widget, form_id, tracking, needs_manual_scheduling, lang } = parsed.data;
    const leadLocale = (typeof lang === "string" && lang.trim()) ? lang.trim().toLowerCase() : null;

    // Polymorphic continuation key: prefer explicit target_type/target_id.
    // Fall back to treating a bare lead_id as target_type="lead" for
    // already-deployed frontends mid-flight that only send lead_id.
    const targetType = parsed.data.target_type ?? "lead";
    const targetId = parsed.data.target_id ?? lead_id ?? null;
    if (!targetId) {
      return new Response(
        JSON.stringify({ error: "Either lead_id or target_id must be provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Safe logging — no PII
    console.log("Received update-lead request:", JSON.stringify({ lead_id, target_type: targetType, target_id: targetId, campaign_id, step_number, from_chat_widget, field_count: Object.keys(field_values || {}).length }));

    // Validate field value sizes
    const fieldValidationError = validateFieldValues(field_values);
    if (fieldValidationError) {
      return new Response(
        JSON.stringify({ error: fieldValidationError }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Contact/client target: update form_submissions, never anew_leads/anew_contacts/anew_clients ---
    if (targetType === "contact" || targetType === "client") {
      const { data: existingSubmission, error: submissionError } = await supabase
        .from("form_submissions")
        .select("*")
        .eq("id", targetId)
        .single();

      if (submissionError || !existingSubmission) {
        console.error("form_submissions row not found:", submissionError);
        return new Response(
          JSON.stringify({ error: "Form submission not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // SECURITY: same defense-in-depth as the lead path — campaign_id must
      // match the row the caller is claiming to continue.
      if ((existingSubmission.campaign_id ?? null) !== (campaign_id ?? null)) {
        console.warn("update-lead campaign mismatch attempt (form_submissions):", JSON.stringify({
          target_id: targetId,
          provided_campaign_id: campaign_id,
          actual_campaign_id: existingSubmission.campaign_id,
        }));
        return new Response(
          JSON.stringify({ error: "Forbidden: campaign_id does not match submission" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const _sanitizeResultSub = sanitizeFieldValues(field_values, {});
      Object.assign(field_values, _sanitizeResultSub.cleaned);
      const sanitizeReportSub = _sanitizeResultSub.report;
      if (sanitizeReportSub.email_rejected) {
        console.warn(`[update-lead] rejected invalid email "${sanitizeReportSub.email_rejected}"`);
      }
      if (sanitizeReportSub.phone_rejected) {
        console.warn(`[update-lead] rejected invalid phone "${sanitizeReportSub.phone_rejected}"`);
      }

      const existingFieldValues = existingSubmission.field_values || {};
      const { _meta: existingMetaSub, ...existingFieldsSub } = existingFieldValues;
      const currentStepSub = step_number || (existingSubmission.current_step || 0) + 1;

      // Recompute totalStepsSub from form config (same source of truth as the
      // "lead" branch below) rather than trusting the value captured at
      // create-lead time — the form's step count may have been corrected/
      // changed since then, and a stale total_steps here can silently
      // produce a wrong is_complete/next_step.
      const canonicalFormIdSub = resolveCanonicalFormId(form_id, existingSubmission.form_id ?? null).formId;
      let totalStepsSub = existingSubmission.total_steps || currentStepSub;
      if (canonicalFormIdSub) {
        const { data: formStepsDataSub } = await supabase
          .from("form_steps")
          .select("step_number")
          .eq("form_id", canonicalFormIdSub)
          .order("step_number", { ascending: false })
          .limit(1);
        totalStepsSub = formStepsDataSub?.[0]?.step_number || totalStepsSub;
      } else {
        const { data: totalStepsDataSub } = await supabase
          .from("campaign_form_steps")
          .select("step_number")
          .eq("campaign_id", campaign_id)
          .order("step_number", { ascending: false })
          .limit(1);
        totalStepsSub = totalStepsDataSub?.[0]?.step_number || totalStepsSub;
      }
      const isCompleteSub = currentStepSub >= totalStepsSub;

      const safeTrackingSub = sanitizeTracking(tracking);
      const preservedTrackingSub = existingMetaSub?.tracking
        ? existingMetaSub.tracking
        : (safeTrackingSub || undefined);

      const updatedFieldValuesSub = {
        ...existingFieldsSub,
        ...field_values,
        _meta: {
          ...existingMetaSub,
          current_step: currentStepSub,
          total_steps: totalStepsSub,
          is_complete: isCompleteSub,
          last_updated: new Date().toISOString(),
          steps_completed: [...(existingMetaSub?.steps_completed || []), currentStepSub].filter(
            (v: number, i: number, a: number[]) => a.indexOf(v) === i
          ).sort((a: number, b: number) => a - b),
          ...(preservedTrackingSub ? { tracking: preservedTrackingSub } : {}),
        }
      };

      const { error: updateSubError } = await supabase
        .from("form_submissions")
        .update({
          field_values: updatedFieldValuesSub,
          current_step: currentStepSub,
          total_steps: totalStepsSub,
          is_complete: isCompleteSub,
          status: isCompleteSub ? "complete" : "in_progress",
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetId);

      if (updateSubError) {
        console.error("Error updating form_submissions:", updateSubError);
        return new Response(
          JSON.stringify({ error: "Error updating form submission", details: updateSubError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Form submission updated successfully:", targetId);

      return new Response(
        JSON.stringify({
          success: true,
          target_type: targetType,
          target_id: targetId,
          current_step: currentStepSub,
          total_steps: totalStepsSub,
          is_complete: isCompleteSub,
          next_step: isCompleteSub ? null : currentStepSub + 1,
          steps_completed: updatedFieldValuesSub._meta.steps_completed,
          sanitized: sanitizeReportSub,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get existing lead
    const { data: existingLead, error: leadError } = await supabase
      .from("anew_leads")
      .select("*, campaigns!anew_leads_campaign_id_fkey(id, organization_id, status, form_id, location_required)")
      .eq("id", targetId)
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
        target_id: targetId,
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
    let formLocationRequired = false;

    if (canonicalFormId) {
      // Needed for the server-side district validation below (CRITICAL: this
      // endpoint is public and must not trust the client-side location check).
      const { data: formLocationData } = await supabase
        .from("forms")
        .select("location_required")
        .eq("id", canonicalFormId)
        .maybeSingle();
      formLocationRequired = !!formLocationData?.location_required;

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
          .neq("id", targetId)
          .filter(`field_values->>${field.field_key}`, "eq", candidate)
          .limit(1);

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

    // CRITICAL: server-side enforcement of location_required/allowed_districts.
    // Mirrors the create-lead check — a direct API call continuing a
    // multi-step form with a district outside campaign_districts/form_districts
    // must be rejected here too.
    const locationValidation = await validateLocationDistrict({
      supabase,
      campaignId: campaignId,
      campaignLocationRequired: existingLead.campaigns?.location_required,
      formId: canonicalFormId,
      formLocationRequired,
      definitions,
      fieldValues: field_values,
    });
    if (!locationValidation.ok) {
      return new Response(
        JSON.stringify({ error: locationValidation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
    const leadUpdate: Record<string, any> = {
      field_values: updatedFieldValues,
      status: isComplete ? "new" : "incomplete",
      updated_at: new Date().toISOString(),
    };
    if (typeof needs_manual_scheduling === "boolean") {
      leadUpdate.needs_manual_scheduling = needs_manual_scheduling;
    }
    if (leadLocale) {
      leadUpdate.locale = leadLocale;
    }
    const { error: updateError } = await supabase
      .from("anew_leads")
      .update(leadUpdate)
      .eq("id", targetId);

    if (updateError) {
      console.error("Error updating lead:", updateError);
      return new Response(
        JSON.stringify({ error: "Error updating lead", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Lead updated successfully:", targetId);

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
          anewLeadId: targetId,
          campaignId: existingLead.campaign_id,
          tracking: effectiveTracking,
          contactName: null,
          leadStatus: isComplete ? 'new' : 'incomplete',
        });
      }
    } catch (attrErr) {
      console.error("[attribution] update-lead outer guard", attrErr);
    }

    // Post-completion emails (per-form options) — same rules as create-lead:
    // confirmation unless the form has a scheduling step (book-slot sends its
    // own richer one), otherwise queue the "finish scheduling" recovery nudge
    // when the visitor didn't pick a slot. Fail-soft.
    if (isComplete && canonicalFormId) {
      try {
        const resolveEmail = (): string | null => {
          for (const key of ["email", "po_email", "Email"]) {
            const v = updatedFieldValues[key];
            const sanitized = sanitizeEmail(v);
            if (sanitized) return sanitized;
          }
          return null;
        };
        const leadEmail = resolveEmail();
        const organizationId = existingLead.organization_id || existingLead.campaigns?.organization_id;

        if (leadEmail && organizationId) {
          const leadName = composeDisplayName(
            updatedFieldValues.first_name || updatedFieldValues.po_nome || updatedFieldValues.nome || "",
            updatedFieldValues.last_name || updatedFieldValues.po_apelido || updatedFieldValues.apelido || "",
          ) || "";

          const { data: schedulingStepCheck } = await supabase
            .from("form_steps")
            .select("id")
            .eq("form_id", canonicalFormId)
            .eq("step_type", "scheduling")
            .limit(1)
            .maybeSingle();

          if (!schedulingStepCheck) {
            await sendLeadConfirmationEmail(supabase, {
              organizationId,
              formId: canonicalFormId,
              leadEmail,
              leadName,
              leadLocale,
            });
          } else if (needs_manual_scheduling) {
            await queueSchedulingInviteRecovery(supabase, {
              organizationId,
              formId: canonicalFormId,
              leadId: targetId,
              leadName,
              leadEmail,
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

    return new Response(
      JSON.stringify({
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
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in update-lead:", error);
    await captureError(error, { function: "update-lead" });
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
