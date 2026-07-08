export type ContactScope = "NONE" | "OWNED" | "TEAM" | "ORG";

export interface ScopedContactLike {
  organization_id: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
}

export interface ContactScopeOptions {
  scope: ContactScope;
  scopedUserIds: readonly string[];
  allowedOrgIds: readonly string[];
}

export function normalizeContactScope(scope: string | null | undefined, onlyMine: boolean): ContactScope {
  if (onlyMine || scope === "OWNED") return "OWNED";
  if (scope === "TEAM") return "TEAM";
  if (scope === "NONE") return "NONE";
  return "ORG";
}

/**
 * Resolves the set of user ids a given scope is restricted to.
 *
 * SECURITY: `teamMemberIds` is only ever folded in when `scope === "TEAM"`.
 * `teamMemberIds` (see usePermissionScope.ts) is populated per-session, not
 * per-permission — it is non-empty whenever ANY permission on the caller's
 * profile has TEAM scope, even if the specific permission being scoped here
 * (e.g. contacts.view / clients.view) is OWNED. Folding it in unconditionally
 * would leak teammates' records to users who only have OWNED access. Do not
 * remove this guard without re-checking every caller.
 */
export function getContactScopeUserIds(
  scope: ContactScope,
  anewUserId: string | null,
  authUserId: string | null,
  teamMemberIds: readonly string[] = [],
): string[] {
  const selfIds = [anewUserId, authUserId].filter(Boolean) as string[];
  const effectiveIds = scope === "TEAM" ? [...selfIds, ...teamMemberIds] : selfIds;
  return [...new Set(effectiveIds)];
}

/**
 * Builds the Supabase `.or(...)` filter string for a scope.
 *
 * `scopedUserIds` is expected to already be the *effective* ids for `scope`
 * (see `getContactScopeUserIds`). As a defensive measure this function does
 * not itself re-add team ids for any scope other than "TEAM" — callers must
 * not pass team member ids here for an "OWNED" scope.
 */
export function buildContactScopeOrFilter(
  scope: ContactScope,
  scopedUserIds: readonly string[],
): string | null {
  if (scope !== "OWNED" && scope !== "TEAM") return null;

  const uniqueIds = [...new Set(scopedUserIds.filter(Boolean))];
  if (uniqueIds.length === 0) return null;

  return uniqueIds
    .flatMap((id) => [`assigned_to.eq.${id}`, `created_by.eq.${id}`])
    .join(",");
}

export function contactMatchesScope(
  contact: ScopedContactLike,
  options: ContactScopeOptions,
): boolean {
  if (options.scope === "NONE") return false;
  if (!contactBelongsToAllowedOrg(contact, options.allowedOrgIds)) return false;
  if (options.scope === "ORG") return true;
  return contactMatchesScopedUsers(contact, options.scopedUserIds);
}

function contactBelongsToAllowedOrg(contact: ScopedContactLike, allowedOrgIds: readonly string[]): boolean {
  if (allowedOrgIds.length === 0) return true;
  return !!contact.organization_id && allowedOrgIds.includes(contact.organization_id);
}

function contactMatchesScopedUsers(contact: ScopedContactLike, scopedUserIds: readonly string[]): boolean {
  if (scopedUserIds.length === 0) return false;
  return scopedUserIds.some((id) => contact.assigned_to === id || contact.created_by === id);
}
