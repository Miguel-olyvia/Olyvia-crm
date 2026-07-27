export interface CanonicalFormResolution {
  formId: string | null;
  error?: string;
}

export interface CampaignValidationResult {
  ok: boolean;
  status?: number;
  error?: string;
  details?: Record<string, unknown>;
}

const WORKFLOW_PERMISSION_BY_SOURCE_ENTITY: Record<string, string> = {
  lead: "leads.edit",
  deal: "deals.edit",
  quote: "quotes.edit",
  proposal: "proposals.edit",
  contract: "client_contracts.edit",
};

export function resolveCanonicalFormId(
  requestedFormId: string | null | undefined,
  campaignFormId: string | null | undefined,
): CanonicalFormResolution {
  const bodyFormId = typeof requestedFormId === "string" && requestedFormId.trim()
    ? requestedFormId.trim()
    : null;
  const canonicalFormId = typeof campaignFormId === "string" && campaignFormId.trim()
    ? campaignFormId.trim()
    : null;

  if (!canonicalFormId) {
    return bodyFormId
      ? {
        formId: null,
        error: "campaign does not have a canonical form_id configured",
      }
      : { formId: null };
  }

  if (bodyFormId && bodyFormId !== canonicalFormId) {
    return {
      formId: null,
      error: "form_id does not match the campaign's canonical form_id",
    };
  }

  return { formId: canonicalFormId };
}

export function validateInsertLeadCampaign(
  tokenOrganizationId: string,
  campaign: { organization_id?: string | null; status?: string | null } | null,
): CampaignValidationResult {
  if (!campaign) {
    return { ok: false, status: 404, error: "Campaign not found" };
  }

  if (!campaign.organization_id || campaign.organization_id !== tokenOrganizationId) {
    return {
      ok: false,
      status: 403,
      error: "Campaign does not belong to the API token organization",
    };
  }

  if (campaign.status !== "active") {
    return {
      ok: false,
      status: 400,
      error: "Campaign is not active",
      details: { status: campaign.status },
    };
  }

  return { ok: true };
}

export async function resolveRootOrganizationId(
  supabase: any,
  organizationId: string | null | undefined,
): Promise<string | null> {
  if (!organizationId) return null;

  try {
    const { data, error } = await supabase.rpc("resolve_root_organization_id", {
      p_org_id: organizationId,
    });
    if (!error && typeof data === "string" && data.trim()) {
      return data;
    }
  } catch {
    // Fallback below.
  }

  let currentOrgId = organizationId;
  const visited = new Set<string>();

  while (currentOrgId && !visited.has(currentOrgId)) {
    visited.add(currentOrgId);
    const { data } = await supabase
      .from("anew_hierarchy")
      .select("parent_org_id")
      .eq("child_org_id", currentOrgId)
      .limit(1)
      .maybeSingle();

    const parentOrgId = data?.parent_org_id ?? null;
    if (!parentOrgId || parentOrgId === currentOrgId) {
      return currentOrgId;
    }
    currentOrgId = parentOrgId;
  }

  return organizationId;
}

export async function cleanupCreatedEntityArtifacts(
  supabase: any,
  entityId: string,
): Promise<void> {
  const { data: entityAddresses } = await supabase
    .from("anew_entity_addresses")
    .select("address_id")
    .eq("entity_id", entityId);

  await supabase.from("anew_entity_addresses").delete().eq("entity_id", entityId);

  const addressIds = (entityAddresses || [])
    .map((row: { address_id?: string | null }) => row.address_id)
    .filter(Boolean);
  if (addressIds.length > 0) {
    await supabase.from("anew_addresses").delete().in("id", addressIds);
  }

  await supabase.from("anew_entity_emails").delete().eq("entity_id", entityId);
  await supabase.from("anew_entity_phones").delete().eq("entity_id", entityId);
  await supabase.from("anew_entity_roles").delete().eq("entity_id", entityId);
  await supabase.from("anew_entities").delete().eq("id", entityId);
}

export interface LocationValidationResult {
  ok: boolean;
  error?: string;
}

export interface FieldDefinitionForLocation {
  field_key?: string | null;
  field_type?: string | null;
  field_label?: string | null;
}

/**
 * Server-side enforcement of campaign/form `location_required` + allowed
 * districts on the public lead endpoints (create-lead, update-lead,
 * insert-lead). Mirrors the read-only calculation already done in
 * get-form-data/index.ts (~lines 299-345): campaign.location_required takes
 * priority over form.location_required, and the allowed district set comes
 * from campaign_districts when the campaign requires location, otherwise
 * from form_districts.
 *
 * The district field is located using the same heuristic the public form
 * client uses to decide which field is "the" district selector
 * (PublicLeadForm.tsx `isDistrictField`): field_type === "ref_district", or
 * field_key/field_label containing "district"/"distrito".
 *
 * This is intentionally permissive when nothing is submitted yet (multi-step
 * forms may not have reached the district step) or when no districts are
 * configured (matches get-form-data's own permissive fallback) — required-ness
 * of the field itself is enforced separately by the existing required-field
 * validation in each endpoint.
 */
export async function validateLocationDistrict(params: {
  supabase: any;
  campaignId?: string | null;
  campaignLocationRequired?: boolean | null;
  formId?: string | null;
  formLocationRequired?: boolean | null;
  definitions: FieldDefinitionForLocation[];
  fieldValues: Record<string, unknown>;
}): Promise<LocationValidationResult> {
  const {
    supabase,
    campaignId,
    campaignLocationRequired,
    formId,
    formLocationRequired,
    definitions,
    fieldValues,
  } = params;

  const locationRequired = !!campaignLocationRequired || !!formLocationRequired;
  if (!locationRequired) return { ok: true };

  const isDistrictDef = (d: FieldDefinitionForLocation): boolean => {
    const key = String(d.field_key || "").toLowerCase();
    const label = String(d.field_label || "").toLowerCase();
    return (
      d.field_type === "ref_district" ||
      key.includes("district") ||
      key.includes("distrito") ||
      label.includes("district") ||
      label.includes("distrito")
    );
  };

  const districtDef = (definitions || []).find(isDistrictDef);
  const districtFieldKey = districtDef?.field_key || null;
  const submittedDistrictId = districtFieldKey ? (fieldValues || {})[districtFieldKey] : null;

  // Nothing submitted for the district field on this request/step — nothing
  // to validate here yet.
  if (submittedDistrictId === undefined || submittedDistrictId === null || submittedDistrictId === "") {
    return { ok: true };
  }

  let allowedDistrictIds: string[] = [];
  if (campaignLocationRequired && campaignId) {
    const { data } = await supabase
      .from("campaign_districts")
      .select("district_id")
      .eq("campaign_id", campaignId);
    allowedDistrictIds = (data || []).map((r: { district_id: string }) => r.district_id);
  } else if (formLocationRequired && formId) {
    const { data } = await supabase
      .from("form_districts")
      .select("district_id")
      .eq("form_id", formId);
    allowedDistrictIds = (data || []).map((r: { district_id: string }) => r.district_id);
  }

  // No districts configured to restrict against — permissive, matching
  // get-form-data's own fallback (an empty allowed_districts array).
  if (allowedDistrictIds.length === 0) {
    return { ok: true };
  }

  if (!allowedDistrictIds.includes(String(submittedDistrictId))) {
    return {
      ok: false,
      error: "Selected district is not within the allowed service area for this campaign/form",
    };
  }

  return { ok: true };
}

export function getWorkflowPermissionForSourceEntity(sourceEntity: string): string | null {
  return WORKFLOW_PERMISSION_BY_SOURCE_ENTITY[sourceEntity] ?? null;
}

export function resolveWorkflowOrganizationFromRecord(
  _sourceEntity: string,
  record: Record<string, unknown> | null | undefined,
): string | null {
  if (!record) return null;
  const orgId = record.organization_id;
  return typeof orgId === "string" && orgId.trim() ? orgId : null;
}
