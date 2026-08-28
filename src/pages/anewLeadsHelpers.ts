export type LeadScope = "ALL" | "ORG" | "TEAM" | "OWNED" | "NONE";

export function normalizeLeadScope(scope: LeadScope, onlyMine: boolean): "ORG" | "TEAM" | "OWNED" {
  if (onlyMine || scope === "OWNED") return "OWNED";
  if (scope === "TEAM") return "TEAM";
  return "ORG";
}

export function getLeadScopeUserIds(
  anewUserId: string | null,
  authUserId: string | null,
  teamMemberIds: readonly string[] = [],
): string[] {
  return [...new Set([anewUserId, authUserId, ...teamMemberIds].filter(Boolean) as string[])];
}

export function reconcileRefreshedLead<T extends { id: string }>(
  leads: T[],
  selectedLead: T | null,
  leadId: string,
  refreshedLead: T | null,
) {
  if (!refreshedLead) {
    return {
      leads: leads.filter((lead) => lead.id !== leadId),
      selectedLead: selectedLead?.id === leadId ? null : selectedLead,
      closeDetails: selectedLead?.id === leadId,
    };
  }

  return {
    leads: leads.map((lead) => lead.id === leadId ? refreshedLead : lead),
    selectedLead: selectedLead?.id === leadId ? refreshedLead : selectedLead,
    closeDetails: false,
  };
}

/**
 * Minimal shape shared with the Postgrest/Supabase query builder: only the
 * `.or()` method this helper needs to call. Kept structural (not imported
 * from supabase-js) so it can be exercised with a lightweight fake in tests
 * without pulling in a live client.
 */
export interface OrFilterableQuery {
  or: (filter: string) => OrFilterableQuery;
}

/**
 * Applies the "assigned_to OR created_by" lead-visibility predicate used by
 * every anew_leads read in AnewLeads.tsx (list/kanban base query, the
 * deep-linked single-lead open, today's callbacks, and the single-lead
 * refresh). Extracted verbatim from those call sites so unifying them means
 * routing all of them through this one function, not rewriting the rule.
 *
 * ORG scope returns the query unchanged: the caller is expected to already
 * have scoped `organization_id`, and ORG grants full visibility within it.
 * NONE is not handled here — callers short-circuit before reaching a query
 * when getPermissionScope("leads.view") is "NONE".
 *
 * teamMemberIds must only be read for the TEAM branch. It is session-global
 * (see usePermissionScope's teamMemberIds), and leaking it into OWNED would
 * silently widen one agent's OWNED view to their whole team.
 */
export function applyLeadVisibilityFilter<Q extends OrFilterableQuery>(
  query: Q,
  requestedScope: "ORG" | "TEAM" | "OWNED",
  scopeAnewUserId: string | null | undefined,
  scopeAuthUserId: string | null | undefined,
  teamMemberIds: readonly string[] = [],
): Q {
  if (requestedScope === "OWNED" && scopeAnewUserId) {
    // teamMemberIds is session-global and must never be used outside the
    // TEAM branch: it is deliberately NOT passed to getLeadScopeUserIds here.
    const ownerIds = getLeadScopeUserIds(scopeAnewUserId, scopeAuthUserId ?? null);
    return query.or(`assigned_to.in.(${ownerIds.join(",")}),created_by.in.(${ownerIds.join(",")})`) as Q;
  }
  if (requestedScope === "TEAM" && scopeAnewUserId) {
    const visibleUserIds = getLeadScopeUserIds(scopeAnewUserId, scopeAuthUserId ?? null, teamMemberIds);
    return query.or(`assigned_to.in.(${visibleUserIds.join(",")}),created_by.in.(${visibleUserIds.join(",")})`) as Q;
  }
  return query;
}

/**
 * Filters a user roster (comercial pickers / assignment dropdowns) down to
 * the users the current viewer's leads.view scope is allowed to see/assign
 * to. Extracted verbatim from AnewLeads.tsx's assignableCompanyUsers /
 * assignableComercialUsers, which were identical except for the source list.
 *
 * ORG sees the full roster. TEAM sees the viewer plus their teammates.
 * Anything else (OWNED, NONE) sees only the viewer themselves — this mirrors
 * today's behavior exactly, including that NONE is not special-cased.
 */
export function filterUsersByLeadScope<U extends { id: string }>(
  users: readonly U[],
  scope: "ORG" | "TEAM" | "OWNED" | "NONE",
  scopeAnewUserId: string | null | undefined,
  teamMemberIds: readonly string[] = [],
): U[] {
  if (scope === "ORG") return [...users];
  if (scope === "TEAM") {
    // teamMemberIds is session-global and must never be used outside the
    // TEAM branch: the OWNED/NONE fallback below reads only scopeAnewUserId.
    const allowedIds = new Set([scopeAnewUserId, ...teamMemberIds].filter(Boolean));
    return users.filter((u) => allowedIds.has(u.id));
  }
  return users.filter((u) => u.id === scopeAnewUserId);
}

export function identityContactIsPrimary(entityCreatedHere: boolean): boolean {
  return entityCreatedHere;
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = { status: "fulfilled", value: await mapper(items[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );

  return results;
}
