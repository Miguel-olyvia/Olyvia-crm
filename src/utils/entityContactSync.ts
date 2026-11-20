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

const DEFAULT_PHONE_COUNTRY_CODE = "+351";

/**
 * Splits a free-text phone (as typed in the lead's field_values) into
 * country code + number. "00" is read as "+". "+351..." (with or without a
 * separator) and plain national numbers default to +351; any other "+NN"
 * prefix is only split when followed by a separator ("+44 7700 900123"),
 * otherwise the full international number is kept as is with no country
 * code, so a foreign number is never mislabelled as Portuguese.
 */
export function splitPhoneCountryCode(raw: string): { phone: string; countryCode: string | null } {
  const value = raw.trim().replace(/^00(?=\d)/, "+");

  const pt = value.match(/^\+351[\s.\-]*(.+)$/);
  if (pt) return { phone: pt[1].trim(), countryCode: DEFAULT_PHONE_COUNTRY_CODE };

  const intl = value.match(/^\+(\d{1,4})[\s.\-]+(.+)$/);
  if (intl) return { phone: intl[2].trim(), countryCode: `+${intl[1]}` };

  if (value.startsWith("+")) return { phone: value, countryCode: null };

  return { phone: value, countryCode: DEFAULT_PHONE_COUNTRY_CODE };
}

/**
 * Sets an entity's primary email. Delegates to rpc_set_entity_primary_email
 * (SECURITY DEFINER, same authorization as the anew_entity_emails UPDATE RLS
 * policy, atomic): every current primary is demoted (is_primary=false, rows
 * are kept as history), an existing row with the same email is promoted, or
 * a new primary row is inserted. Previously this did a browser-side DELETE of
 * the primaries + INSERT — not atomic, and a DELETE silently filtered by RLS
 * left the old primary next to the new one.
 *
 * `_createdBy` is kept for call-site compatibility only: created_by is now
 * resolved server-side (current_business_user_id), never trusted from the client.
 */
export async function linkEntityEmail(
  entityId: string,
  email: string,
  _createdBy: string | null = null,
): Promise<void> {
  if (!entityId || !email.trim()) return;

  const { error } = await (supabase as any).rpc("rpc_set_entity_primary_email", {
    p_entity_id: entityId,
    p_email: email.trim(),
  });
  if (error) throw error;
}

export interface EntityPrimaryContacts {
  /** Email principal mais recente da ficha do cliente, ou null. */
  email: string | null;
  /** Telefone principal mais recente, já com indicativo ("+351912345678"), ou null. */
  phone: string | null;
}

/**
 * Lê o email e o telefone principais de UMA entidade, diretamente da base
 * (sem cache), para o «Editar Lead» mostrar a mesma verdade que o separador
 * Info e a proposta: o contacto principal mais recente por created_at — a
 * mesma regra de useEntityIdentity.resolveEntities (que fica com o último de
 * uma lista ordenada ascendente) e de validateEntityCoherence.
 *
 * Lê só as duas tabelas de contactos: não passa pelo resolveEntities porque
 * esse também revela o NIF (nif-reveal) e lê moradas, o que o diálogo não
 * precisa para isto. Um erro de leitura é lançado, não engolido: quem chama
 * decide o que mostrar.
 */
export async function fetchEntityPrimaryContacts(entityId: string): Promise<EntityPrimaryContacts> {
  const [emailsRes, phonesRes] = await Promise.all([
    supabase
      .from("anew_entity_emails")
      .select("email, created_at")
      .eq("entity_id", entityId)
      .eq("is_primary", true)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("anew_entity_phones")
      .select("phone_number, country_code, created_at")
      .eq("entity_id", entityId)
      .eq("is_primary", true)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (emailsRes.error) throw emailsRes.error;
  if (phonesRes.error) throw phonesRes.error;

  const emailRow = (emailsRes.data ?? [])[0] as { email?: string | null } | undefined;
  const phoneRow = (phonesRes.data ?? [])[0] as
    | { phone_number?: string | null; country_code?: string | null }
    | undefined;

  const email = emailRow?.email?.trim() || null;
  return { email, phone: composeEntityPhone(phoneRow?.phone_number, phoneRow?.country_code) };
}

/** "+351" + "912345678" → "+351912345678" (o formato que o campo de telefone da lead usa). */
function composeEntityPhone(phoneNumber?: string | null, countryCode?: string | null): string | null {
  const number = (phoneNumber ?? "").trim();
  if (!number) return null;
  if (number.startsWith("+") || number.startsWith("00")) return number;
  const code = (countryCode ?? "").trim();
  if (!code) return number;
  const dialCode = code.startsWith("+") ? code : `+${code.replace(/^00/, "")}`;
  return `${dialCode}${number.replace(/[\s().-]/g, "")}`;
}

/**
 * Erro do email recusado por já pertencer a outra entidade da mesma
 * organização (fn_check_email_unique_within_org: ERRCODE unique_violation,
 * mensagem «Já existe outra entidade (<uuid>) com este email na mesma
 * organização (<uuid>)»). Devolve o id da outra entidade quando a mensagem o
 * traz; a base não devolve o nome.
 */
export function parseEmailInUseError(error: unknown): { isEmailInUse: boolean; otherEntityId: string | null } {
  const e = (error ?? {}) as { code?: unknown; message?: unknown };
  const message = typeof e.message === "string" ? e.message : "";
  const mentionsOtherEntity = /outra entidade/i.test(message) && /email/i.test(message);
  const isEmailInUse = mentionsOtherEntity || (e.code === "23505" && /email/i.test(message));
  if (!isEmailInUse) return { isEmailInUse: false, otherEntityId: null };
  const match = message.match(/entidade \(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/i);
  return { isEmailInUse: true, otherEntityId: match ? match[1] : null };
}

/** Sets an entity's primary phone — same semantics as linkEntityEmail (rpc_set_entity_primary_phone). */
export async function linkEntityPhone(
  entityId: string,
  phone: string,
  _createdBy: string | null = null,
): Promise<void> {
  if (!entityId || !phone.trim()) return;

  const { phone: phoneNumber, countryCode } = splitPhoneCountryCode(phone);
  if (!phoneNumber) return;

  const { error } = await (supabase as any).rpc("rpc_set_entity_primary_phone", {
    p_entity_id: entityId,
    p_phone: phoneNumber,
    p_country_code: countryCode ?? "",
  });
  if (error) throw error;
}
