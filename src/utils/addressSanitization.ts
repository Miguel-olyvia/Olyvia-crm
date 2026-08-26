/**
 * Shared address sanitization helpers (browser).
 * Mirror of supabase/functions/_shared/addressSanitization.ts — keep in sync.
 */
import { supabase } from "@/integrations/supabase/client";

const STREET_ALIASES = ["morada", "address", "street", "po_morada", "endereco", "rua"];
const POSTAL_ALIASES = ["codigo_postal", "postal_code", "zip", "cp", "po_codigo_postal"];
const CITY_ALIASES = ["localidade", "city", "cidade", "po_localidade"];
const DISTRICT_ALIASES = ["concelho", "distrito", "district", "po_concelho", "po_distrito"];

const REJECTED_TOKENS = new Set([
  "", "-", "--", "n/a", "na", "null", "none", "s/n", "sn", "0000-000", "0000",
]);
const ONLY_PUNCT_OR_SPACE = /^[\p{P}\s]+$/u;
const POSTAL_RE = /^\d{4}-\d{3}$/;

const normKey = (k: string) => k.toLowerCase().replace(/[\s_\-]/g, "");

function pickByAliases(fv: Record<string, any>, aliases: string[]): string | null {
  const normAliases = aliases.map(normKey);
  for (const key of Object.keys(fv || {})) {
    if (key === "_meta") continue;
    const nk = normKey(key);
    for (const a of normAliases) {
      if (nk === a || nk.endsWith(a)) {
        const v = fv[key];
        if (v == null) return null;
        const s = String(v);
        return s;
      }
    }
  }
  return null;
}

function cleanText(raw: string | null, { min = 2, max = 255 } = {}): string | null {
  if (raw == null) return null;
  const collapsed = String(raw).replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  const lower = collapsed.toLowerCase();
  if (REJECTED_TOKENS.has(lower)) return null;
  if (ONLY_PUNCT_OR_SPACE.test(collapsed)) return null;
  if (collapsed.length < min) return null;
  return collapsed.slice(0, max);
}

function cleanPostal(raw: string | null): string | null {
  if (raw == null) return null;
  const s = String(raw).replace(/\s+/g, "").replace(/-+/g, "-").trim();
  if (!s) return null;
  if (REJECTED_TOKENS.has(s.toLowerCase())) return null;
  if (!POSTAL_RE.test(s)) return null;
  if (s === "0000-000") return null;
  return s;
}

export interface SanitizedAddress {
  street: string | null;
  postal_code: string | null;
  city: string | null;
  district: string | null;
  hasCoreMinimum: boolean;
  hasAnyUsefulData: boolean;
}

export function sanitizeAddressFields(fieldValues: Record<string, any> | null | undefined): SanitizedAddress {
  const fv = fieldValues || {};
  const street = cleanText(pickByAliases(fv, STREET_ALIASES));
  const postal_code = cleanPostal(pickByAliases(fv, POSTAL_ALIASES));
  const city = cleanText(pickByAliases(fv, CITY_ALIASES));
  const district = cleanText(pickByAliases(fv, DISTRICT_ALIASES));
  const hasCoreMinimum = !!(street && postal_code);
  const hasAnyUsefulData = !!(street || postal_code || city || district);
  return { street, postal_code, city, district, hasCoreMinimum, hasAnyUsefulData };
}

export interface AddressRow {
  street?: string | null;
  postal_code?: string | null;
  city?: string | null;
  district?: string | null;
  number?: string | null;
  country?: string | null;
}

export function isSuspiciousAddress(row: AddressRow | null | undefined): boolean {
  if (!row) return true;
  if (cleanText(row.street ?? null) == null) return true;
  if (cleanText(row.city ?? null) == null) return true;
  if (cleanPostal(row.postal_code ?? null) == null) return true;
  return false;
}

export function buildAddressKey(parts: {
  street?: string | null;
  number?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
}): string {
  const norm = (v: string | null | undefined) =>
    String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const country = norm(parts.country) || "pt";
  return [
    norm(parts.street),
    norm(parts.number),
    norm(parts.postal_code),
    norm(parts.city),
    country,
  ].join("|");
}

// ── Orchestrator ──
type SyncDecision =
  | "insert_new"
  | "update_in_place"
  | "clone_and_repoint"
  | "skip_no_valid_source"
  | "skip_existing_valid"
  | "error";

export interface SyncResult {
  decision: SyncDecision;
  addressId?: string;
  reason?: string;
}

function strengthScore(s: SanitizedAddress | AddressRow): number {
  let score = 0;
  const street = (s as any).street;
  const pc = (s as any).postal_code;
  const city = (s as any).city;
  const district = (s as any).district;
  if (cleanText(street ?? null)) score += 2;
  if (cleanPostal(pc ?? null)) score += 2;
  if (cleanText(city ?? null)) score += 1;
  if (cleanText(district ?? null)) score += 1;
  return score;
}

export async function syncEntityPrimaryAddressFromLead(args: {
  supabase: typeof supabase;
  entityId: string;
  organizationId: string;
  fieldValues: Record<string, any> | null | undefined;
  actorId: string | null;
  allowOverwriteValid: boolean;
}): Promise<SyncResult> {
  const { supabase: db, entityId, organizationId, fieldValues, actorId, allowOverwriteValid } = args;
  try {
    const san = sanitizeAddressFields(fieldValues);
    if (!san.hasAnyUsefulData) return { decision: "skip_no_valid_source", reason: "no useful data in lead" };

    const { data: link } = await db
      .from("anew_entity_addresses")
      .select("id, address_id")
      .eq("entity_id", entityId)
      .eq("is_primary", true)
      .is("valid_to", null)
      .maybeSingle();

    // CASE A — no current primary link. Delegates to the sync_entity_primary_address
    // RPC (SECURITY DEFINER) so the address insert and the entity link happen in a
    // single transaction — a plain insert+insert from here left 5 orphaned addresses
    // in prod when the second insert failed after the first one succeeded.
    if (!link) {
      if (!san.hasCoreMinimum) return { decision: "skip_no_valid_source", reason: "missing street+postal_code for new insert" };
      if (!organizationId) return { decision: "error", reason: "organizationId is required to sync entity address" };
      const { data: rpcData, error: rpcErr } = await db.rpc("sync_entity_primary_address", {
        p_entity_id: entityId,
        p_organization_id: organizationId,
        p_street: san.street,
        p_postal_code: san.postal_code,
        p_city: san.city,
        p_district: san.district,
        p_created_by: actorId,
      } as any);
      if (rpcErr) return { decision: "error", reason: rpcErr.message };
      const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!row?.address_id) return { decision: "skip_no_valid_source", reason: row?.decision ?? "rpc returned no address" };
      return { decision: "insert_new", addressId: row.address_id };
    }

    // CASE B — existing link
    const { data: curr } = await db
      .from("anew_addresses")
      .select("id, street, number, postal_code, city, district, country")
      .eq("id", link.address_id)
      .maybeSingle();

    if (!curr) return { decision: "error", reason: "linked address row not found" };

    const suspicious = isSuspiciousAddress(curr as AddressRow);
    if (!suspicious && !allowOverwriteValid) {
      return { decision: "skip_existing_valid" };
    }
    if (!suspicious && allowOverwriteValid) {
      if (strengthScore(san) <= strengthScore(curr as AddressRow)) {
        return { decision: "skip_existing_valid", reason: "lead source not stronger than current" };
      }
    }

    // Build patch — only non-null sanitized fields (never write null to NOT NULL cols)
    const patch: Record<string, any> = {};
    if (san.street) patch.street = san.street;
    if (san.postal_code) patch.postal_code = san.postal_code;
    if (san.city) patch.city = san.city;
    if (san.district) patch.district = san.district;

    const merged: AddressRow = {
      street: patch.street ?? curr.street,
      postal_code: patch.postal_code ?? curr.postal_code,
      city: patch.city ?? curr.city,
      district: patch.district ?? curr.district,
      number: curr.number,
      country: curr.country ?? "PT",
    };
    if (isSuspiciousAddress(merged)) {
      return { decision: "skip_no_valid_source", reason: "merged result still suspicious" };
    }

    const newKey = buildAddressKey({
      street: merged.street, number: merged.number ?? "",
      postal_code: merged.postal_code, city: merged.city, country: merged.country ?? "PT",
    });

    // Active reference count across entity + org links (no anew_user_addresses in this project)
    const [{ count: entCount }, { count: orgCount }] = await Promise.all([
      db.from("anew_entity_addresses").select("id", { count: "exact", head: true })
        .eq("address_id", curr.id).is("valid_to", null),
      db.from("anew_org_addresses").select("id", { count: "exact", head: true })
        .eq("address_id", curr.id).is("valid_to", null),
    ]);
    const activeRefs = (entCount ?? 0) + (orgCount ?? 0);

    if (activeRefs <= 1) {
      const { error: uErr } = await db.from("anew_addresses")
        .update({ ...patch, address_key: newKey } as any)
        .eq("id", curr.id);
      if (uErr) return { decision: "error", reason: uErr.message };
      return { decision: "update_in_place", addressId: curr.id };
    }

    // Clone + repoint (address shared with other entities/orgs, so it can't be
    // mutated in place): delegates to the same sync_entity_primary_address RPC
    // used by CASE A — it inserts-or-reuses the address by key and repoints the
    // entity's primary link atomically, closing the old link in the same
    // transaction. Avoids the address-insert-then-link-insert-then-old-link-close
    // three-step sequence that could leave things half-done on a mid-way failure.
    if (!organizationId) return { decision: "error", reason: "organizationId is required to sync entity address" };
    const { data: rpcData, error: rpcErr } = await db.rpc("sync_entity_primary_address", {
      p_entity_id: entityId,
      p_organization_id: organizationId,
      p_street: merged.street,
      p_postal_code: merged.postal_code,
      p_city: merged.city,
      p_district: merged.district,
      p_created_by: actorId,
    } as any);
    if (rpcErr) return { decision: "error", reason: rpcErr.message };
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!row?.address_id) return { decision: "skip_no_valid_source", reason: row?.decision ?? "rpc returned no address" };
    return { decision: "clone_and_repoint", addressId: row.address_id };
  } catch (e: any) {
    return { decision: "error", reason: e?.message ?? String(e) };
  }
}
