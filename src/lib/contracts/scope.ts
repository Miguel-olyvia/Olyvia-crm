import type { ScopeLevel } from "@/hooks/usePermissionScope";

/**
 * Resolves which `client_contracts.created_by` values the viewer's
 * `client_contracts.view` scope allows into the Contratos list and its KPI
 * cards (src/pages/ClientContracts.tsx).
 *
 * This restores the predicate commit 54d65378 ("feat(contracts): visibilidade
 * por área em vez de por criador", 2026-08-22) removed — OWNED → self,
 * TEAM → self + team_member_ids, resolved by `created_by` — and matches the
 * SAME field `canActOnEntity`/`applyScopeFilter` (usePermissionScope.ts)
 * already use for this page's edit/delete scope, and the pattern the
 * proposals-for-contracts picker query in this same file (and Proposals.tsx /
 * Quotes.tsx) already apply for their own OWNED/TEAM scope.
 *
 * Returns:
 * - `null` for ORG — no restriction, caller should apply no filter at all.
 * - `[]` for NONE, or for TEAM/OWNED when the viewer has no resolved
 *   anew_users id yet — caller must treat this as "return nothing" (an empty
 *   `.in(...)` filter matches no rows, which is the same outcome).
 * - the deduplicated list of allowed ids otherwise (self only for OWNED,
 *   self + team_member_ids for TEAM).
 */
export function resolveContractsScopeUserIds(
  viewScope: ScopeLevel,
  anewUserId: string | null,
  teamMemberIds: readonly string[] = [],
): string[] | null {
  if (viewScope === "ORG") return null;
  if (viewScope === "NONE") return [];

  const allowed = new Set<string>();
  if (anewUserId) allowed.add(anewUserId);
  if (viewScope === "TEAM") {
    teamMemberIds.forEach((id) => { if (id) allowed.add(id); });
  }
  return [...allowed];
}
