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

/**
 * Contracts-only action gate (edit today; any future client_contracts write
 * gate keyed on `client_contracts.edit` should reuse this), aligned with the
 * SAME `created_by` OR `assigned_to` union `resolveContractsScopeUserIds`
 * already applies to the list's `client_contracts.view` scope.
 *
 * Product decision (2026-08-29): a contract REASSIGNED to someone (i.e. its
 * `assigned_to`, not its `created_by`) must be actionable by that person, not
 * merely visible. Before this, an OWNED-scope user could see a contract
 * assigned to them in the list but `canActOnEntity` (usePermissionScope.ts,
 * keyed on `created_by` alone) refused every edit — they could not even sign
 * it. Measured against the remote: 14/90 contracts (16%) have
 * `assigned_to <> created_by`, 9 of those still unsigned.
 *
 * Deliberately NOT a change to `canActOnEntity` — that helper is shared with
 * leads, proposals and quotes, none of which have an `assigned_to` union for
 * their edit scope and none of which this task asked to touch. This is a
 * separate, contracts-specific function.
 *
 * Scope semantics are otherwise identical to `canActOnEntity`:
 *   NONE  -> reject
 *   ORG   -> allow
 *   TEAM  -> allow iff (created_by OR assigned_to) is the caller, OR is one
 *            of the caller's teamMemberIds
 *   OWNED -> allow iff (created_by OR assigned_to) is the caller
 */
export function canActOnContract(
  scope: ScopeLevel,
  contract: { created_by?: string | null; assigned_to?: string | null },
  anewUserId: string | null,
  teamMemberIds: readonly string[] = [],
): boolean {
  if (scope === "NONE") return false;
  if (scope === "ORG") return true;

  const owners = [contract.created_by, contract.assigned_to].filter(
    (id): id is string => Boolean(id),
  );

  if (scope === "TEAM") {
    return owners.some((id) => id === anewUserId || teamMemberIds.includes(id));
  }

  // OWNED
  return owners.some((id) => id === anewUserId);
}
