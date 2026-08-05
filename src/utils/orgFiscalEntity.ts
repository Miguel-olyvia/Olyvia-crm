import { supabase } from "@/integrations/supabase/client";
import { ensureOrgEntity } from "@/utils/orgEntity";
import { callFiscalEntityResolve } from "@/lib/nif/callFiscalEntityResolve";
import { callNifRevealSingle } from "@/lib/nif/callNifReveal";

export async function upsertOrgFiscalEntity(
  orgId: string,
  nif: string,
  commercialName: string | null,
  countryCode: string = "PT",
  createdBy: string | null = null
): Promise<void> {
  if (!nif) return;

  const { data: org } = await (supabase as any)
    .from("anew_organizations")
    .select("entity_id, name")
    .eq("id", orgId)
    .maybeSingle();

  const entityId = org?.entity_id || await ensureOrgEntity({
    orgId,
    orgName: commercialName || org?.name || "Organização",
    createdBy,
    nif,
    countryCode,
  });

  const { data: resolved, error: resolveError } = await callFiscalEntityResolve({
    nif,
    countryCode,
    commercialName,
  });
  if (resolveError) throw resolveError;
  if (!resolved) throw new Error("Failed to resolve fiscal entity");

  const fiscalEntityId = resolved.fiscalEntityId;

  const { error: deleteError } = await (supabase as any).from("anew_entity_fiscal_entities").delete().eq("entity_id", entityId);
  if (deleteError) throw deleteError;
  const { error: linkError } = await (supabase as any).from("anew_entity_fiscal_entities").insert({
    entity_id: entityId, fiscal_entity_id: fiscalEntityId, is_primary: true, created_by: createdBy,
  });
  if (linkError) throw linkError;
}

/**
 * Resolves a NIF via the shared, encrypted fiscal-entities system
 * (fiscal-entity-resolve edge function — same mechanism upsertOrgFiscalEntity
 * uses for an organization's own NIF) and links it to an arbitrary entity
 * (e.g. a lead's anew_entities row), replacing any previous primary link.
 *
 * Unlike upsertOrgFiscalEntity, this does not create/resolve the entity —
 * the caller must already have a valid entityId.
 */
export async function linkEntityFiscalEntity(
  entityId: string,
  nif: string,
  commercialName: string | null,
  countryCode: string = "PT",
  createdBy: string | null = null
): Promise<void> {
  if (!entityId || !nif) return;

  const { data: resolved, error: resolveError } = await callFiscalEntityResolve({
    nif,
    countryCode,
    commercialName,
  });
  if (resolveError) throw resolveError;
  if (!resolved) throw new Error("Failed to resolve fiscal entity");

  const fiscalEntityId = resolved.fiscalEntityId;

  const { error: deleteError } = await (supabase as any)
    .from("anew_entity_fiscal_entities")
    .delete()
    .eq("entity_id", entityId)
    .eq("is_primary", true);
  if (deleteError) throw deleteError;

  const { error: linkError } = await (supabase as any).from("anew_entity_fiscal_entities").insert({
    entity_id: entityId, fiscal_entity_id: fiscalEntityId, is_primary: true, created_by: createdBy,
  });
  if (linkError) throw linkError;
}

export async function removeOrgFiscalEntity(orgId: string): Promise<void> {
  const { data: org } = await (supabase as any)
    .from("anew_organizations").select("entity_id").eq("id", orgId).maybeSingle();
  if (org?.entity_id) {
    await (supabase as any).from("anew_entity_fiscal_entities").delete().eq("entity_id", org.entity_id);
  }
}

export async function loadOrgFiscalEntity(
  orgId: string
): Promise<{ nif: string; commercialName: string; countryCode: string } | null> {
  const { data: org } = await (supabase as any)
    .from("anew_organizations").select("entity_id").eq("id", orgId).maybeSingle();
  if (!org?.entity_id) return null;

  const { data: link } = await (supabase as any)
    .from("anew_entity_fiscal_entities")
    .select("fiscal_entity_id")
    .eq("entity_id", org.entity_id)
    .eq("is_primary", true)
    .limit(1)
    .maybeSingle();

  if (!link?.fiscal_entity_id) return null;

  const { data: fe } = await (supabase as any)
    .from("fiscal_entities")
    .select("commercial_name, country_code")
    .eq("id", link.fiscal_entity_id)
    .maybeSingle();

  if (!fe) return null;

  const nif = await callNifRevealSingle(link.fiscal_entity_id);

  return {
    nif: nif || "",
    commercialName: fe.commercial_name || "",
    countryCode: fe.country_code || "PT",
  };
}
