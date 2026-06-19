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
