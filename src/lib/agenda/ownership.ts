import type { AgendaItemRow } from "./types";

/**
 * União dos DOIS caminhos de dono de `schedule_items`.
 *
 * Medido no remoto a 2026-09-01: 1849 itens, 26 com `user_id` preenchido (1%),
 * 1838 linhas em `schedule_item_assignees`. Ler só por `user_id` devolveria 1%
 * da agenda; ler só por assignees perderia o que o assistente de IA cria.
 * A união não é uma precaução — é a única leitura que não nasce vazia.
 *
 *   caminho A: schedule_items.user_id                       -> anew_users(id)
 *   caminho B: schedule_item_assignees -> schedule_resources.user_id -> anew_users(id)
 */

/** Dono pelo caminho directo (coluna `user_id`), se existir. */
export function getDirectOwnerId(row: AgendaItemRow): string | null {
  const id = row.user_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** Donos pelo caminho dos assignees, sem repetições. */
export function getAssigneeOwnerIds(row: AgendaItemRow): string[] {
  const ids = new Set<string>();
  for (const assignee of row.assignees ?? []) {
    const id = assignee?.resource?.user_id;
    if (typeof id === "string" && id.length > 0) ids.add(id);
  }
  return Array.from(ids);
}

/** Todos os donos do item, pelos dois caminhos. */
export function getAllOwnerIds(row: AgendaItemRow): string[] {
  const direct = getDirectOwnerId(row);
  const ids = new Set<string>(getAssigneeOwnerIds(row));
  if (direct) ids.add(direct);
  return Array.from(ids);
}

export function matchesDirectOwner(row: AgendaItemRow, ownerIds: ReadonlySet<string>): boolean {
  const direct = getDirectOwnerId(row);
  return direct !== null && ownerIds.has(direct);
}

export function matchesAssigneeOwner(row: AgendaItemRow, ownerIds: ReadonlySet<string>): boolean {
  return getAssigneeOwnerIds(row).some((id) => ownerIds.has(id));
}

/**
 * Junta listas preservando a ordem da primeira ocorrência e descartando ids
 * repetidos. Um item atribuído ao próprio pelos dois caminhos aparece nas duas
 * listas e tem de sair uma só vez.
 */
export function mergeById<T extends { id: string }>(...lists: ReadonlyArray<readonly T[]>): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const list of lists) {
    for (const row of list) {
      if (!row || seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }
  }
  return merged;
}

/**
 * Selecciona os itens de `ownerIds` pela união dos dois caminhos, deduplicada.
 *
 * `ownerIds` vazio devolve lista vazia (âmbito NONE / utilizador por resolver);
 * o âmbito ORG não passa por aqui — nesse caso a RLS já é o filtro.
 */
export function selectItemsForOwners<T extends AgendaItemRow>(
  rows: readonly T[],
  ownerIds: readonly string[]
): T[] {
  const owners = new Set(ownerIds.filter((id) => typeof id === "string" && id.length > 0));
  if (owners.size === 0) return [];

  const byDirectPath = rows.filter((row) => matchesDirectOwner(row, owners));
  const byAssigneePath = rows.filter((row) => matchesAssigneeOwner(row, owners));

  return mergeById(byDirectPath, byAssigneePath);
}

/**
 * Ids de dono correspondentes ao âmbito da permissão.
 * ORG devolve `null`: não há filtro do lado do cliente, vale o que a RLS deixou passar.
 */
export function resolveOwnerIdsForScope(
  scope: "NONE" | "OWNED" | "TEAM" | "ORG",
  anewUserId: string | null,
  teamMemberIds: readonly string[]
): string[] | null {
  if (scope === "ORG") return null;
  if (scope === "NONE" || !anewUserId) return [];
  if (scope === "TEAM") return Array.from(new Set([anewUserId, ...teamMemberIds]));
  return [anewUserId];
}
