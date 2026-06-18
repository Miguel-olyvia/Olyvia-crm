/**
 * Strict-blocking rule for the shared DuplicateEntityDialog (opt-in).
 *
 * Default consumers of DuplicateEntityDialog keep their existing behaviour —
 * this module is only consulted when a caller opts in via the dialog's
 * `strictBlocking` prop or by calling `revalidateStrongDuplicatesBeforeWrite`
 * directly from a CRM page handler.
 *
 * Rule (only when strictBlocking is on):
 *  - aggregate the strong matched fields (email / phone / nif) per entityId,
 *    separating same-org from cross-org (group) scopes;
 *  - block "Criar mesmo assim" when:
 *      a) any same-org entity has an email match, OR
 *      b) any same-org entity has 2+ strong fields, OR
 *      c) any match is cross-org strong, OR
 *      d) every match is cross-org (no same-org reason to create here).
 */

import type { DuplicateMatch } from "@/components/shared/DuplicateEntityDialog";
import { findEntityMatches } from "@/utils/orgEntity";

export type StrongField = "email" | "phone" | "nif";
const STRONG: readonly StrongField[] = ["email", "phone", "nif"] as const;

export interface StrictBlockingResult {
  shouldBlock: boolean;
  sameOrgBlock: boolean;
  crossOrgStrong: boolean;
  onlyCrossOrg: boolean;
}

/**
 * Pure UI rule. Reads `matchFields[]` if present, else falls back to the
 * legacy singular `matchField` so existing callers keep working.
 */
export function computeStrictShouldBlock(matches: DuplicateMatch[]): StrictBlockingResult {
  if (!matches || matches.length === 0) {
    return { shouldBlock: false, sameOrgBlock: false, crossOrgStrong: false, onlyCrossOrg: false };
  }

  const fieldsByEntity = new Map<string, { sameOrg: Set<StrongField>; group: Set<StrongField> }>();
  for (const m of matches) {
    const raw: any = (m as any).matchFields;
    const fields: string[] = Array.isArray(raw)
      ? raw
      : m.matchField
      ? [m.matchField]
      : [];
    for (const f of fields) {
      if (!(STRONG as readonly string[]).includes(f)) continue;
      const slot = fieldsByEntity.get(m.entityId) ?? { sameOrg: new Set(), group: new Set() };
      (m.scope === "group" ? slot.group : slot.sameOrg).add(f as StrongField);
      fieldsByEntity.set(m.entityId, slot);
    }
  }

  let sameOrgBlock = false;
  let crossOrgStrong = false;
  for (const s of fieldsByEntity.values()) {
    if (s.sameOrg.has("email") || s.sameOrg.size >= 2) sameOrgBlock = true;
    if (s.group.size >= 1) crossOrgStrong = true;
  }
  const onlyCrossOrg = matches.every((m) => m.scope === "group");

  return {
    shouldBlock: sameOrgBlock || crossOrgStrong || onlyCrossOrg,
    sameOrgBlock,
    crossOrgStrong,
    onlyCrossOrg,
  };
}

/**
 * Fetches per-entity strong field sets for same-org matches via the existing
 * `findEntityMatches` RPC. Used by the CRM pages (Leads/Contacts/Clients) to
 * tag locally-built DuplicateMatch rows with `matchFields[]` so the dialog's
 * strict rule sees all simultaneous coincidences (not just the priority one
 * that `fetchSameOrgMatchFields` returns).
 *
 * Non-fatal: returns an empty map on error.
 */
export async function fetchSameOrgFieldsByEntity(params: {
  orgId: string;
  email?: string | null;
  phone?: string | null;
  vat?: string | null;
  countryCode?: string;
}): Promise<Map<string, StrongField[]>> {
  const { orgId, email, phone, vat, countryCode = "PT" } = params;
  const out = new Map<string, StrongField[]>();
  if (!orgId) return out;
  if (!email && !phone && !vat) return out;
  try {
    const matches = await findEntityMatches({
      orgId,
      email: email || null,
      phone: phone || null,
      nif: vat || null,
      countryCode,
    });
    const acc = new Map<string, Set<StrongField>>();
    for (const m of matches) {
      if (m.scope !== "same_org") continue;
      const f = m.matchField as StrongField;
      if (!(STRONG as readonly string[]).includes(f)) continue;
      const set = acc.get(m.entityId) ?? new Set<StrongField>();
      set.add(f);
      acc.set(m.entityId, set);
    }
    for (const [k, v] of acc.entries()) out.set(k, Array.from(v));
  } catch (err) {
    console.warn("[duplicate-blocking] same-org fields lookup failed (non-fatal)", err);
  }
  return out;
}

/**
 * DB revalidation immediately before a write. Re-runs `findEntityMatches`
 * (same-org + cross-org) with the current payload and applies the strict
 * rule. This catches:
 *   - matches missing from the UI snapshot (stale dialog);
 *   - simultaneous fields hidden by a singular matchField row in the UI;
 *   - other users having created a duplicate between dialog open and click.
 *
 * Does NOT guarantee atomicity — a tiny race remains between this call and
 * the subsequent INSERTs. Closing that race fully would require either a
 * transactional RPC or a dedicated DB constraint (out of scope here).
 */
export async function revalidateStrongDuplicatesBeforeWrite(params: {
  orgId: string;
  email?: string | null;
  phone?: string | null;
  vat?: string | null;
  countryCode?: string;
}): Promise<{ shouldBlock: boolean; matches: DuplicateMatch[] }> {
  const { orgId, email, phone, vat, countryCode = "PT" } = params;
  if (!orgId || (!email && !phone && !vat)) {
    return { shouldBlock: false, matches: [] };
  }

  let raw: Awaited<ReturnType<typeof findEntityMatches>> = [];
  try {
    raw = await findEntityMatches({
      orgId,
      email: email || null,
      phone: phone || null,
      nif: vat || null,
      countryCode,
    });
  } catch (err) {
    // Fail-open: if revalidation itself fails, do not block the write. The
    // user-facing duplicate dialog already happened; we just lose the extra
    // safety net on this attempt.
    console.warn("[duplicate-blocking] pre-write revalidation lookup failed", err);
    return { shouldBlock: false, matches: [] };
  }

  // Build synthetic DuplicateMatch rows aggregating fields per entity, so
  // computeStrictShouldBlock can reason over `matchFields[]`.
  const acc = new Map<
    string,
    {
      scope: "same_org" | "group";
      fields: Set<StrongField>;
      displayName: string | null;
      primaryOrgId: string | null;
      primaryOrgName: string | null;
      ownerOrgAccessible: boolean;
    }
  >();
  for (const m of raw) {
    if (!(STRONG as readonly string[]).includes(m.matchField)) continue;
    const slot =
      acc.get(m.entityId) ??
      {
        scope: m.scope,
        fields: new Set<StrongField>(),
        displayName: m.displayName,
        primaryOrgId: m.primaryOrgId,
        primaryOrgName: m.primaryOrgName,
        ownerOrgAccessible: m.ownerOrgAccessible,
      };
    slot.fields.add(m.matchField as StrongField);
    // same_org takes precedence over group when both rows exist for one entity
    if (slot.scope === "group" && m.scope === "same_org") slot.scope = "same_org";
    acc.set(m.entityId, slot);
  }

  const matches: DuplicateMatch[] = Array.from(acc.entries()).map(([entityId, slot]) => ({
    id: `revalidate:${entityId}`,
    entityId,
    displayName: slot.displayName || "Entidade",
    email: null,
    phone: null,
    status: "active",
    type: "contact",
    createdAt: new Date().toISOString(),
    scope: slot.scope,
    primaryOrgId: slot.primaryOrgId,
    primaryOrgName: slot.primaryOrgName,
    ownerOrgAccessible: slot.ownerOrgAccessible,
    matchField: Array.from(slot.fields)[0],
    matchFields: Array.from(slot.fields),
  } as DuplicateMatch & { matchFields: StrongField[] }));

  const { shouldBlock } = computeStrictShouldBlock(matches);
  return { shouldBlock, matches };
}
