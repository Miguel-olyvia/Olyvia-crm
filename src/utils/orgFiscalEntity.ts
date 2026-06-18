import { supabase } from "@/integrations/supabase/client";
import { ensureOrgEntity } from "@/utils/orgEntity";

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

  const { data: existing, error: existingError } = await (supabase as any)
    .from("fiscal_entities")
    .select("id")
    .eq("nif", nif)
    .eq("country_code", countryCode)
    .limit(2);

  if (existingError) throw existingError;
  if (existing && existing.length > 1) throw new Error("Fiscal entity match is ambiguous");

  let fiscalEntityId: string;

  if (existing?.[0]) {
    fiscalEntityId = existing[0].id;
    const { error: updateError } = await (supabase as any)
      .from("fiscal_entities")
      .update({ commercial_name: commercialName, updated_at: new Date().toISOString() })
      .eq("id", fiscalEntityId);
    if (updateError) throw updateError;
  } else {
    const { data: created, error } = await (supabase as any)
      .from("fiscal_entities")
      .insert({ nif, commercial_name: commercialName, country_code: countryCode, created_by: createdBy })
      .select("id")
      .single();
    if (error) throw error;
    fiscalEntityId = created.id;
  }

  const { error: deleteError } = await (supabase as any).from("anew_entity_fiscal_entities").delete().eq("entity_id", entityId);
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
    .select("nif, commercial_name, country_code")
    .eq("id", link.fiscal_entity_id)
    .maybeSingle();

  if (!fe) return null;

  return {
    nif: fe.nif || "",
    commercialName: fe.commercial_name || "",
    countryCode: fe.country_code || "PT",
  };
}
