import { supabase } from "@/integrations/supabase/client";

/**
 * Replaces an entity's primary address with the given street/postal
 * code/city — same "always overwrite" philosophy as linkEntityFiscalEntity
 * (src/utils/orgFiscalEntity.ts) for the NIF: a manual edit in the Lead
 * dialog is a deliberate correction and must actually change what every
 * contract/document that reads anew_entity_addresses sees, not just sit in
 * the lead's field_values JSONB forever.
 *
 * Delegates the actual write to the sync_entity_primary_address RPC
 * (SECURITY DEFINER, org-scoped, dedup by address_key, idempotent). This
 * function used to do its own `insert(...).select("id").single()` against
 * anew_addresses directly from the browser's authenticated client — that
 * always failed with a 42501 RLS violation, because
 * authenticated_select_anew_addresses only exposes addresses already linked
 * to an entity/organization, so the RETURNING of a brand new insert was
 * blocked and the whole statement aborted. The RPC runs with elevated
 * privilege and returns the id via its own RETURNS TABLE, not a table
 * SELECT, so RLS never applies to it.
 *
 * Never persists a half address (street without postal code, or the
 * reverse) — mirrors the same guard already used by update-lead's
 * additive-only address backfill.
 */
export async function linkEntityAddress(
  entityId: string,
  organizationId: string,
  street: string,
  postalCode: string,
  city: string,
  createdBy: string | null = null,
): Promise<void> {
  if (!entityId || !organizationId || !street.trim() || !postalCode.trim()) return;

  const { error } = await supabase.rpc("sync_entity_primary_address", {
    p_entity_id: entityId,
    p_organization_id: organizationId,
    p_street: street.trim(),
    p_postal_code: postalCode.trim(),
    p_city: city.trim() || null,
    p_district: null,
    p_created_by: createdBy,
  });
  if (error) throw error;
}

/** Replaces an entity's primary email — same overwrite semantics as linkEntityAddress. */
export async function linkEntityEmail(
  entityId: string,
  email: string,
  createdBy: string | null = null,
): Promise<void> {
  if (!entityId || !email.trim()) return;

  const { error: deleteError } = await supabase
    .from("anew_entity_emails")
    .delete()
    .eq("entity_id", entityId)
    .eq("is_primary", true);
  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase.from("anew_entity_emails").insert({
    entity_id: entityId,
    email: email.trim(),
    email_type: "personal",
    is_primary: true,
    created_by: createdBy,
  });
  if (insertError) throw insertError;
}

/** Replaces an entity's primary phone — same overwrite semantics as linkEntityAddress. */
export async function linkEntityPhone(
  entityId: string,
  phone: string,
  createdBy: string | null = null,
): Promise<void> {
  if (!entityId || !phone.trim()) return;

  const { error: deleteError } = await supabase
    .from("anew_entity_phones")
    .delete()
    .eq("entity_id", entityId)
    .eq("is_primary", true);
  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase.from("anew_entity_phones").insert({
    entity_id: entityId,
    phone_number: phone.trim(),
    phone_type: "mobile",
    is_primary: true,
    created_by: createdBy,
  });
  if (insertError) throw insertError;
}
