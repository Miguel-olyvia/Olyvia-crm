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

export function getContactScopeUserIds(
  anewUserId: string | null,
  authUserId: string | null,
  teamMemberIds: readonly string[] = [],
): string[] {
  return [...new Set([anewUserId, authUserId, ...teamMemberIds].filter(Boolean) as string[])];
}

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
