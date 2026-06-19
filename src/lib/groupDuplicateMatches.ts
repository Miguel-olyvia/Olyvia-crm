import { findEntityMatches } from "@/utils/orgEntity";
import type { DuplicateMatch } from "@/components/shared/DuplicateEntityDialog";

/**
 * Returns DuplicateMatch entries for entities that exist in OTHER organisations
 * within the caller's hierarchy group (scope='group'). Same-org matches are
 * filtered out — the page already finds those through its local lookups.
 *
 * These matches reveal only display_name + owner-org name, never operational
 * data (leads, contacts, clients) from the owner org.
 */
export async function fetchGroupDuplicateMatches(params: {
  orgId: string;
  email?: string | null;
  phone?: string | null;
  vat?: string | null;
  excludeEntityIds?: string[];
}): Promise<DuplicateMatch[]> {
  const { orgId, email, phone, vat, excludeEntityIds = [] } = params;
  if (!orgId) return [];
  if (!email && !phone && !vat) return [];

  try {
    const matches = await findEntityMatches({
      orgId,
      email: email || null,
      phone: phone || null,
      nif: vat || null,
    });
    const skip = new Set(excludeEntityIds);
    return matches
      .filter((m) => m.scope === "group" && !skip.has(m.entityId))
      .map((m) => ({
        // synthetic id — group rows don't represent a single lead/contact/client
        id: `group:${m.entityId}`,
        entityId: m.entityId,
        displayName: m.displayName || "Entidade do grupo",
        email: null,
        phone: null,
        status: "active",
        type: "contact" as const,
        createdAt: new Date().toISOString(),
        scope: "group" as const,
        primaryOrgId: m.primaryOrgId,
        primaryOrgName: m.primaryOrgName,
        ownerOrgAccessible: m.ownerOrgAccessible,
        matchField: m.matchField,
      }));
  } catch (err) {
    console.warn("[group-duplicates] lookup failed (non-fatal)", err);
    return [];
  }
}

/**
 * Same-org match-field lookup. Returns `Map<entityId, "email"|"phone"|"nif">`
 * so callers can tag local DuplicateMatch rows (built from operational tables)
 * with the field that triggered the match. Non-fatal: returns empty map on error.
 */
export async function fetchSameOrgMatchFields(params: {
  orgId: string;
  email?: string | null;
  phone?: string | null;
  vat?: string | null;
}): Promise<Map<string, "email" | "phone" | "nif">> {
  const { orgId, email, phone, vat } = params;
  const out = new Map<string, "email" | "phone" | "nif">();
  if (!orgId) return out;
  if (!email && !phone && !vat) return out;
  try {
    const matches = await findEntityMatches({
      orgId,
      email: email || null,
      phone: phone || null,
      nif: vat || null,
    });
    // NIF wins over phone wins over email (most specific first)
    const priority: Record<string, number> = { nif: 3, phone: 2, email: 1 };
    for (const m of matches) {
      if (m.scope !== "same_org") continue;
      const existing = out.get(m.entityId);
      if (!existing || priority[m.matchField] > priority[existing]) {
        out.set(m.entityId, m.matchField);
      }
    }
  } catch (err) {
    console.warn("[same-org match-fields] lookup failed (non-fatal)", err);
  }
  return out;
}

