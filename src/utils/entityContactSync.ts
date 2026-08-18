import { supabase } from "@/integrations/supabase/client";

/**
 * Replaces an entity's primary address with the given street/postal
 * code/city — same "always overwrite" philosophy as linkEntityFiscalEntity
 * (src/utils/orgFiscalEntity.ts) for the NIF: a manual edit in the Lead
 * dialog is a deliberate correction and must actually change what every
 * contract/document that reads anew_entity_addresses sees, not just sit in
 * the lead's field_values JSONB forever.
 *
 * Never persists a half address (street without postal code, or the
 * reverse) — mirrors the same guard already used by update-lead's
 * additive-only address backfill.
 */
export async function linkEntityAddress(
  entityId: string,
  street: string,
  postalCode: string,
  city: string,
  createdBy: string | null = null,
): Promise<void> {
  if (!entityId || !street.trim() || !postalCode.trim()) return;

  const cleanStreet = street.trim();
  const cleanPostalCode = postalCode.trim();
  const cleanCity = city.trim();
  const addressKey = [cleanStreet, cleanPostalCode, cleanCity].join("|").toLowerCase();

  let addressId: string | null = null;
  const { data: existingAddress, error: existingAddressError } = await supabase
    .from("anew_addresses")
    .select("id")
    .eq("address_key", addressKey)
    .maybeSingle();
  if (existingAddressError) throw existingAddressError;

  if (existingAddress?.id) {
    addressId = existingAddress.id;
  } else {
    const { data: newAddress, error: addressInsertError } = await supabase
      .from("anew_addresses")
      .insert({
        address_key: addressKey,
        street: cleanStreet,
        number: "",
        postal_code: cleanPostalCode,
        city: cleanCity || "",
        country: "PT",
        created_by: createdBy,
      })
      .select("id")
      .single();
    if (addressInsertError) throw addressInsertError;
    addressId = newAddress?.id ?? null;
  }
  if (!addressId) return;

  const { error: deleteError } = await supabase
    .from("anew_entity_addresses")
    .delete()
    .eq("entity_id", entityId)
    .eq("is_primary", true);
  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase.from("anew_entity_addresses").insert({
    entity_id: entityId,
    address_id: addressId,
    address_type: "primary",
    is_primary: true,
    created_by: createdBy,
  });
  if (insertError) throw insertError;
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
