// Forces organization scoping on multi-tenant table queries made with the
// service_role client. Edge Functions using SUPABASE_SERVICE_ROLE_KEY bypass
// RLS entirely, so every query against a multi-tenant table normally relies
// on the developer remembering to add `.eq("organization_id", ...)` by hand.
// `orgScoped()` makes that filter structurally mandatory: it throws
// immediately if organizationId is missing, instead of silently returning
// cross-tenant rows.
//
// KNOWN EXCEPTIONS — tables that do NOT use a plain `organization_id` column
// and therefore must NOT be wrapped with this helper (query them directly
// and document why):
//   - anew_hierarchy                 -> scoped by org_id / parent_org_id (tree edges, not tenant rows)
//   - anew_entity_org_links          -> links entities to orgs, scoped by (entity_id, organization_id) pair
//   - notifications                  -> scoped by user_id, organization_id is metadata only
//   - fiscal_entities                -> scoped by country_code, shared across orgs by design (NIF lookups)
//   - tables using root_organization_id (hierarchy-wide rollups, e.g. some
//     reporting/aggregation tables) -> use `.eq("root_organization_id", ...)` directly
//
// This helper does not replace validateOrgScope() in _shared/auth.ts, which
// checks *whether the caller is allowed to see* an organization_id. Use both:
// validateOrgScope to authorize the organizationId, orgScoped to guarantee
// every query against that table actually applies the filter.

/**
 * Minimal shape of the subset of the Supabase query builder this helper
 * needs. Kept loose (not the full PostgrestQueryBuilder type) because the
 * shared _shared/*.ts helpers already pass around untyped `supabase: any`
 * clients (see auth.ts, entityScopedLookup.ts).
 */
export interface OrgScopedQueryBuilder {
  eq(column: string, value: string): OrgScopedQueryBuilder;
  select(...args: unknown[]): OrgScopedQueryBuilder;
  insert(...args: unknown[]): OrgScopedQueryBuilder;
  update(...args: unknown[]): OrgScopedQueryBuilder;
  delete(...args: unknown[]): OrgScopedQueryBuilder;
  [key: string]: unknown;
}

export interface OrgScopedClient {
  from(table: string): OrgScopedQueryBuilder;
}

/**
 * Returns a query builder for `table` with `.eq("organization_id", organizationId)`
 * already applied. Throws if organizationId is null/undefined/empty, so a
 * missing tenant filter fails loudly at call time instead of leaking rows
 * across organizations.
 *
 * Only use this for tables whose tenant column is literally `organization_id`.
 * See the exceptions list at the top of this file for tables that need a
 * different column and must be queried directly instead.
 *
 * @throws Error if organizationId is missing.
 */
export function orgScoped(
  supabase: OrgScopedClient,
  table: string,
  organizationId: string | null | undefined,
): OrgScopedQueryBuilder {
  if (!organizationId) {
    throw new Error(
      `orgScoped: organizationId is required to query "${table}" (got ${JSON.stringify(organizationId)})`,
    );
  }

  return supabase.from(table).eq("organization_id", organizationId);
}
