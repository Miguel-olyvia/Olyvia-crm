import { supabase } from "@/integrations/supabase/client";
import { callFiscalEntityResolve } from "@/lib/nif/callFiscalEntityResolve";

export type EntityMatchScope = "same_org" | "group";

export interface EntityMatchResult {
  entityId: string;
  scope: EntityMatchScope;
  primaryOrgId: string | null;
  primaryOrgName: string | null;
  ownerOrgAccessible: boolean;
  matchField: "email" | "phone" | "nif";
  displayName: string | null;
}

/**
 * Cross-org duplicate detection. Wraps the `find_entity_matches` RPC.
 * Never reveals entities from organizations the caller cannot see.
 */
export async function findEntityMatches(params: {
  orgId: string;
  email?: string | null;
  phone?: string | null;
  nif?: string | null;
  countryCode?: string;
}): Promise<EntityMatchResult[]> {
  const { orgId, email, phone, nif, countryCode = "PT" } = params;
  if (!orgId) return [];
  if (!email && !phone && !nif) return [];

  // p_nif_hash is included explicitly (even as null) so PostgREST resolves
  // unambiguously to the 6-arg find_entity_matches overload added in
  // 20261030010000_nif_enc_find_entity_matches_hash_overload.sql. Without this
  // key present in the request, PostgREST cannot disambiguate between the
  // 5-arg and 6-arg overloads (PGRST203) - Postgres's own "fewest defaults"
  // tie-break does not apply at the PostgREST RPC layer. The browser has no
  // access to the HMAC key, so it cannot compute a real hash here; null falls
  // back to the legacy plaintext nif comparison inside the function, same
  // behavior as before this fix.
  const { data, error } = await (supabase as any).rpc("find_entity_matches", {
    p_org_id: orgId,
    p_email: email ?? null,
    p_phone: phone ?? null,
    p_nif: nif ?? null,
    p_country_code: countryCode,
    p_nif_hash: null,
  });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    entityId: r.entity_id,
    scope: r.scope,
    primaryOrgId: r.primary_org_id ?? null,
    primaryOrgName: r.primary_org_name ?? null,
    ownerOrgAccessible: !!r.owner_org_accessible,
    matchField: r.match_field,
    displayName: r.display_name ?? null,
  }));
}

/**
 * Authorises (opt-in) an existing entity to appear in another organisation
 * of the same hierarchy group. Never exposes operational data cross-org.
 */
export async function linkEntityToOrg(entityId: string, targetOrgId: string): Promise<void> {
  if (!entityId || !targetOrgId) throw new Error("entityId and targetOrgId are required");
  const { error } = await (supabase as any).rpc("link_entity_to_org", {
    p_entity_id: entityId,
    p_target_org_id: targetOrgId,
  });
  if (error) throw error;
}

/**
 * Idempotent LOCAL link of an entity to one of the caller's organizations.
 * - Use `isPrimary=true` only when registering a brand-new entity in its
 *   home org (the org that created it).
 * - Use `isPrimary=false` (default) when simply reusing an existing entity
 *   inside the SAME organization.
 * - NEVER use this for cross-org sharing. Cross-org sharing must always go
 *   through `linkEntityToOrg` (RPC `link_entity_to_org`), which is the only
 *   path allowed to populate `shared_from_org_id`, `shared_by`, `shared_at`.
 */
export async function ensureEntityOrgLink(params: {
  entityId: string;
  organizationId: string;
  isPrimary?: boolean;
}): Promise<void> {
  const { entityId, organizationId, isPrimary = false } = params;
  if (!entityId || !organizationId) {
    throw new Error("entityId and organizationId are required");
  }
  const { error } = await (supabase as any).rpc("ensure_entity_org_link", {
    p_entity_id: entityId,
    p_organization_id: organizationId,
    p_is_primary: isPrimary,
  });
  if (error) throw error;
}





type EnsureOrgEntityOptions = {
  orgId: string;
  orgName: string;
  createdBy: string | null;
  nif?: string | null;
  countryCode?: string;
};

async function findEntityByFiscalIdentity(nif: string, countryCode: string): Promise<string | null> {
  const { data: resolved, error: resolveError } = await callFiscalEntityResolve({ nif, countryCode });
  if (resolveError) throw resolveError;
  if (!resolved) return null;

  const { data: links, error: linkError } = await (supabase as any)
    .from("anew_entity_fiscal_entities")
    .select("entity_id")
    .eq("fiscal_entity_id", resolved.fiscalEntityId)
    .limit(2);

  if (linkError) throw linkError;
  if (!links || links.length !== 1) return null;

  return links[0].entity_id;
}

export async function createOrganizationEntity(params: {
  displayName: string;
  createdBy: string | null;
}): Promise<string> {
  const entityId = crypto.randomUUID();
  const { error } = await (supabase as any)
    .from("anew_entities")
    .insert({
      id: entityId,
      display_name: params.displayName,
      type: "organization",
      status: "active",
      created_by: params.createdBy,
    });

  if (error) throw error;
  return entityId;
}

export async function resolveOrganizationEntityId(params: {
  orgName: string;
  createdBy: string | null;
  nif?: string | null;
  countryCode?: string;
}): Promise<string> {
  const nif = params.nif?.trim();
  const matchedEntityId = nif ? await findEntityByFiscalIdentity(nif, params.countryCode || "PT") : null;
  return matchedEntityId ?? await createOrganizationEntity({ displayName: params.orgName, createdBy: params.createdBy });
}

export async function ensureOrgEntity(options: EnsureOrgEntityOptions): Promise<string> {
  const { orgId, orgName, createdBy, countryCode = "PT" } = options;
  const nif = options.nif?.trim();

  const { data: org, error: orgError } = await (supabase as any)
    .from("anew_organizations")
    .select("entity_id, name")
    .eq("id", orgId)
    .maybeSingle();

  if (orgError) throw orgError;
  if (org?.entity_id) return org.entity_id;

  const entityId = await resolveOrganizationEntityId({ orgName: orgName || org?.name || "Organização", createdBy, nif, countryCode });

  const { error: updateError } = await (supabase as any)
    .from("anew_organizations")
    .update({ entity_id: entityId, updated_at: new Date().toISOString() })
    .eq("id", orgId);

  if (updateError) throw updateError;
  return entityId;
}
