import { supabase } from "@/integrations/supabase/client";
import { escapeIlike, searchEntityIds } from "@/lib/clientSearch";
import { getContactScopeUserIds, buildContactScopeOrFilter } from "@/lib/contacts/scope";
import type { ScopeLevel } from "@/hooks/usePermissionScope";

/**
 * Unified "pedido / lead / cliente" search.
 *
 * Every picker that lets a user attach a deal, a lead or a client to a
 * document (quote builder, proposal creation, ...) must resolve candidates
 * through this module instead of hand-rolling its own queries. The previous
 * per-screen copies drifted apart and each lost a different guarantee:
 * one never searched leads at all, another applied no scope filter to the
 * clients branch, and a third gated deals on `proposals.view` while only
 * reaching deals through leads assigned to the caller.
 *
 * The two invariants enforced here, for every branch, are:
 *
 *  1. ORG ISOLATION — results are always restricted to `orgIds`, which the
 *     caller derives from the ACTIVE company (plus its hierarchy subtree).
 *     An empty `orgIds` returns nothing; it never degrades to "all orgs".
 *  2. PERMISSION SCOPE — each branch applies its own permission's scope
 *     (`deals.view` / `leads.view` / `clients.view`), exactly as the
 *     corresponding list page does. A NONE scope drops the branch, and a
 *     non-ORG scope with no resolvable owner id fails CLOSED rather than
 *     returning unrestricted rows.
 *
 * RLS is the backstop, not the mechanism: these filters must stand on their
 * own so a scope-restricted user cannot use a search box to discover records
 * that never appear in their own Deals/Leads/Clients lists.
 */

export const MIN_SEARCH_TERM_LENGTH = 2;

const DEFAULT_LIMIT_PER_KIND = 25;

/** Sentinel used to force an empty result set when a scope cannot be resolved. */
const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";

export type ScopedSearchKind = "deal" | "lead" | "client";

export const ALL_SCOPED_SEARCH_KINDS: readonly ScopedSearchKind[] = ["deal", "lead", "client"];

export interface ScopedSearchResult {
  kind: ScopedSearchKind;
  id: string;
  /** Deal title, or the entity display name for a lead/client. */
  name: string;
  /** Contact name behind a deal; undefined for leads/clients (name already is it). */
  contactName?: string;
  email?: string;
  phone?: string;
  entityId: string | null;
  organizationId: string | null;
  assignedTo: string | null;
  status?: string | null;
  /** Labels taken from the record itself, used when its entity is unreadable. */
  fallbackName?: string | null;
  fallbackEmail?: string | null;
  fallbackPhone?: string | null;
  /** Deal-only: the records the deal already points at, used to inherit ownership. */
  dealClientId?: string | null;
  dealLeadId?: string | null;
  dealContactId?: string | null;
  /** Deal-only metadata, so a picker can show/carry it without a second round-trip. */
  dealProbability?: number | null;
  dealValue?: number | null;
  dealExpectedCloseDate?: string | null;
  dealStageName?: string | null;
}

export interface ScopedSearchViewer {
  isSystemAdmin: boolean;
  anewUserId: string | null;
  authUserId: string | null;
  teamMemberIds: readonly string[];
  getPermissionScope: (permissionCode: string) => ScopeLevel;
}

export interface ScopedSearchParams {
  term: string;
  /** Active company id + its descendant orgs. Empty means "no access". */
  orgIds: readonly string[];
  viewer: ScopedSearchViewer;
  kinds?: readonly ScopedSearchKind[];
  limitPerKind?: number;
  /**
   * Narrows every branch to a single contact/entity. Used by pickers opened
   * from a client or contact detail view, where only that party's records are
   * relevant. This narrows the result set — it never widens it past the org
   * and scope filters.
   */
  restrictToEntityId?: string | null;
}

/**
 * Normalizes what the user typed. The `@` prefix is accepted but never
 * required — the quote builder used to silently return nothing unless the
 * term started with `@`, which is the main reason that box looked broken.
 */
export function normalizeSearchTerm(raw: string): string {
  return raw.replace(/^@+/, "").trim();
}

interface BranchScope {
  level: ScopeLevel;
  /** Owner ids the branch is restricted to; empty for an ORG scope. */
  userIds: string[];
}

function resolveBranchScope(viewer: ScopedSearchViewer, permissionCode: string): BranchScope {
  const level: ScopeLevel = viewer.isSystemAdmin ? "ORG" : viewer.getPermissionScope(permissionCode);
  if (level === "ORG" || level === "NONE") return { level, userIds: [] };
  return {
    level,
    userIds: getContactScopeUserIds(level, viewer.anewUserId, viewer.authUserId, viewer.teamMemberIds),
  };
}

/**
 * Applies an owner restriction to a query builder.
 *
 * Returns the query unchanged for an ORG scope, and a guaranteed-empty query
 * when a restricted scope has no owner ids to match on — never an unfiltered
 * query.
 */
function applyOwnerScope<T>(query: T, scope: BranchScope): T {
  if (scope.level === "ORG") return query;
  const orFilter = buildContactScopeOrFilter(scope.level, scope.userIds);
  if (!orFilter) return (query as any).eq("id", NO_MATCH_ID);
  return (query as any).or(orFilter);
}

const DEAL_COLUMNS =
  "id, title, client_id, lead_id, contact_id, organization_id, entity_id, assigned_to, created_by, " +
  "probability, value, expected_close_date, deal_stages(name)";

async function searchDeals(
  term: string,
  matchedEntityIds: readonly string[],
  orgIds: readonly string[],
  viewer: ScopedSearchViewer,
  limit: number,
  restrictToEntityId?: string | null,
): Promise<ScopedSearchResult[]> {
  const scope = resolveBranchScope(viewer, "deals.view");
  if (scope.level === "NONE") return [];

  const like = `%${escapeIlike(term)}%`;
  const baseQuery = () => {
    let query = (supabase as any)
      .from("deals")
      .select(DEAL_COLUMNS)
      .in("organization_id", orgIds)
      .is("deleted_at", null)
      .limit(limit);
    // Applies to the title pass too: a deal whose title matches but which
    // belongs to a different contact must stay out of a restricted search.
    if (restrictToEntityId) query = query.eq("entity_id", restrictToEntityId);
    return query;
  };

  // Two passes: the title itself, and deals whose contact/entity matched the
  // term. A deal called "Remodelação T3" must still be found by typing the
  // client's name, and vice-versa.
  const queries: Promise<{ data: any[] | null }>[] = [
    applyOwnerScope(baseQuery().ilike("title", like), scope),
  ];
  if (matchedEntityIds.length > 0) {
    queries.push(applyOwnerScope(baseQuery().in("entity_id", matchedEntityIds), scope));
  }

  const responses = await Promise.all(queries);
  const merged = new Map<string, any>();
  responses.forEach((response) => {
    (response.data || []).forEach((row: any) => merged.set(row.id, row));
  });

  return Array.from(merged.values()).map((row: any) => ({
    kind: "deal" as const,
    id: row.id,
    name: row.title || "Pedido",
    entityId: row.entity_id ?? null,
    organizationId: row.organization_id ?? null,
    assignedTo: row.assigned_to ?? null,
    dealClientId: row.client_id ?? null,
    dealLeadId: row.lead_id ?? null,
    dealContactId: row.contact_id ?? null,
    dealProbability: row.probability ?? null,
    dealValue: row.value ?? null,
    dealExpectedCloseDate: row.expected_close_date ?? null,
    dealStageName: row.deal_stages?.name ?? null,
  }));
}

async function searchLeads(
  term: string,
  matchedEntityIds: readonly string[],
  orgIds: readonly string[],
  viewer: ScopedSearchViewer,
  limit: number,
  restrictToEntityId?: string | null,
): Promise<ScopedSearchResult[]> {
  const scope = resolveBranchScope(viewer, "leads.view");
  if (scope.level === "NONE") return [];

  const baseQuery = () => {
    let query = (supabase as any)
      .from("anew_leads")
      // field_values is selected so the lead can be labelled from its OWN data:
      // RLS on anew_entities can hide the linked entity even when the lead
      // itself is visible, and falling back to "Lead #abc12345" in that case
      // makes the result useless to pick from.
      .select("id, entity_id, organization_id, assigned_to, status, field_values")
      .in("organization_id", orgIds)
      .is("deleted_at", null)
      .limit(limit);
    if (restrictToEntityId) query = query.eq("entity_id", restrictToEntityId);
    return query;
  };

  // Two passes, mirroring how the Leads page itself searches.
  //
  // `search_text` is a denormalized column on anew_leads holding the lead's
  // own name/email/phone. It is the ONLY thing AnewLeads.tsx matches on
  // (applyLeadsServerFilters), and it is why a lead can be visible in the
  // Leads list yet invisible to an entity-join search: the lead's identity
  // does not necessarily live in a linked anew_entities row. Matching only by
  // entity id is exactly what made leads go missing from this picker.
  const queries: Promise<{ data: any[] | null }>[] = [
    applyOwnerScope(baseQuery().ilike("search_text", `%${escapeIlike(term)}%`), scope),
  ];
  if (matchedEntityIds.length > 0) {
    queries.push(applyOwnerScope(baseQuery().in("entity_id", matchedEntityIds), scope));
  }

  const responses = await Promise.all(queries);
  const merged = new Map<string, any>();
  responses.forEach((response) => {
    (response.data || []).forEach((row: any) => merged.set(row.id, row));
  });

  return Array.from(merged.values()).map((row: any) => {
    const fields = (row.field_values ?? {}) as Record<string, unknown>;
    const asText = (key: string) => {
      const value = fields[key];
      return typeof value === "string" && value.trim() ? value.trim() : null;
    };
    const fallbackName =
      asText("display_name") ||
      asText("name") ||
      [asText("first_name"), asText("last_name")].filter(Boolean).join(" ").trim() ||
      null;

    return {
      kind: "lead" as const,
      id: row.id,
      name: "",
      fallbackName,
      fallbackEmail: asText("email"),
      fallbackPhone: asText("phone") || asText("mobile"),
      entityId: row.entity_id ?? null,
      organizationId: row.organization_id ?? null,
      assignedTo: row.assigned_to ?? null,
      status: row.status ?? null,
    };
  });
}

async function searchClients(
  matchedEntityIds: readonly string[],
  orgIds: readonly string[],
  viewer: ScopedSearchViewer,
  limit: number,
): Promise<ScopedSearchResult[]> {
  if (matchedEntityIds.length === 0) return [];

  const scope = resolveBranchScope(viewer, "clients.view");
  if (scope.level === "NONE") return [];

  const query = applyOwnerScope(
    (supabase as any)
      .from("anew_clients")
      .select("id, entity_id, organization_id, assigned_to, status")
      .in("organization_id", orgIds)
      .in("entity_id", matchedEntityIds)
      .is("deleted_at", null)
      .limit(limit),
    scope,
  );

  const { data } = await query;
  return (data || []).map((row: any) => ({
    kind: "client" as const,
    id: row.id,
    name: "",
    entityId: row.entity_id ?? null,
    organizationId: row.organization_id ?? null,
    assignedTo: row.assigned_to ?? null,
    status: row.status ?? null,
  }));
}

interface EntityDetails {
  name: string | null;
  email?: string;
  phone?: string;
}

async function loadEntityDetails(entityIds: readonly string[]): Promise<Map<string, EntityDetails>> {
  const details = new Map<string, EntityDetails>();
  if (entityIds.length === 0) return details;

  const [entities, emails, phones] = await Promise.all([
    supabase.from("anew_entities").select("id, display_name, first_name, last_name").in("id", entityIds),
    supabase.from("anew_entity_emails").select("entity_id, email").in("entity_id", entityIds).eq("is_primary", true),
    supabase
      .from("anew_entity_phones")
      .select("entity_id, phone_number")
      .in("entity_id", entityIds)
      .eq("is_primary", true),
  ]);

  (entities.data || []).forEach((row: any) => {
    const name =
      row.display_name || [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || null;
    details.set(row.id, { name });
  });
  (emails.data || []).forEach((row: any) => {
    const current = details.get(row.entity_id);
    if (current) current.email = row.email ?? undefined;
  });
  (phones.data || []).forEach((row: any) => {
    const current = details.get(row.entity_id);
    if (current) current.phone = row.phone_number ?? undefined;
  });

  return details;
}

const FALLBACK_LABEL: Record<ScopedSearchKind, string> = {
  deal: "Pedido",
  lead: "Lead",
  client: "Cliente",
};

/**
 * Searches deals, leads and clients in one pass, restricted to `orgIds` and to
 * what the viewer's permission scope actually allows for each kind.
 *
 * Returns `[]` — never unscoped results — for a too-short term or when the
 * caller has no active organization.
 */
export async function searchDealsLeadsClients(params: ScopedSearchParams): Promise<ScopedSearchResult[]> {
  const term = normalizeSearchTerm(params.term);
  if (term.length < MIN_SEARCH_TERM_LENGTH) return [];

  // ORG ISOLATION: no active organization resolved means no results at all.
  const orgIds = Array.from(new Set(params.orgIds.filter(Boolean)));
  if (orgIds.length === 0) return [];

  const kinds = params.kinds ?? ALL_SCOPED_SEARCH_KINDS;
  const limit = params.limitPerKind ?? DEFAULT_LIMIT_PER_KIND;
  const { viewer, restrictToEntityId } = params;

  const { ids: allMatchedEntityIds } = await searchEntityIds(term);
  // Intersect rather than replace, so the restriction can only ever narrow.
  const matchedEntityIds = restrictToEntityId
    ? allMatchedEntityIds.filter((id) => id === restrictToEntityId)
    : allMatchedEntityIds;

  const [deals, leads, clients] = await Promise.all([
    kinds.includes("deal")
      ? searchDeals(term, matchedEntityIds, orgIds, viewer, limit, restrictToEntityId)
      : Promise.resolve([]),
    kinds.includes("lead")
      ? searchLeads(term, matchedEntityIds, orgIds, viewer, limit, restrictToEntityId)
      : Promise.resolve([]),
    kinds.includes("client") ? searchClients(matchedEntityIds, orgIds, viewer, limit) : Promise.resolve([]),
  ]);

  const rows: ScopedSearchResult[] = [...deals, ...leads, ...clients];
  const entityIds = Array.from(
    new Set(rows.map((row) => row.entityId).filter(Boolean) as string[]),
  );
  const entityDetails = await loadEntityDetails(entityIds);

  return rows.map((row) => {
    const details = row.entityId ? entityDetails.get(row.entityId) : undefined;
    const entityName = details?.name ?? null;
    // Prefer the entity's name, then the record's own fields, and only then a
    // bare id — so a row whose entity is hidden by RLS is still identifiable.
    const resolvedName =
      row.kind === "deal"
        ? row.name
        : entityName || row.fallbackName || `${FALLBACK_LABEL[row.kind]} #${row.id.slice(0, 8)}`;

    return {
      ...row,
      name: resolvedName,
      contactName: row.kind === "deal" ? entityName ?? row.fallbackName ?? undefined : undefined,
      email: details?.email ?? row.fallbackEmail ?? undefined,
      phone: details?.phone ?? row.fallbackPhone ?? undefined,
    };
  });
}
