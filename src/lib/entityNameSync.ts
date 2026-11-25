/**
 * Espelho em TS do que a BASE faz ao nome da ficha (migration
 * 20261229910000_nome_unico_da_ficha). Nao e usado pelos ecras para gravar:
 * serve para fixar, em testes, a regra do gatilho.
 *
 * Regra do dono: a ficha tem UM so nome (display_name). Pessoa = nome +
 * apelido; organizacao = o proprio nome; um display_name explicito e
 * respeitado. A empresa da lead nao entra no nome. O gatilho so recompoe uma
 * ficha que estava «em sincronia» (o nome era nome + apelido).
 */
import { composeDisplayName } from "@/utils/composeDisplayName";

export interface EntityNameRow {
  type: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
}

/** Espacos e NBSP colapsados e aparados, como normalizeFirstLast. */
export function normalizeName(value: string | null | undefined): string {
  return (value || "").replace(/[\s\u00a0]+/g, " ").trim();
}

/** Espelho de public.fn_entity_display_name. null = nao ha nome com que compor. */
export function entityDisplayNameRule(row: EntityNameRow): string | null {
  if (row.type !== "person") return normalizeName(row.display_name) || null;
  return composeDisplayName(normalizeName(row.first_name), normalizeName(row.last_name)) || null;
}

/** A ficha esta em sincronia se o nome e o que a regra daria. */
export function isEntityNameInSync(row: EntityNameRow): boolean {
  const composed = entityDisplayNameRule(row);
  return composed !== null && composed === normalizeName(row.display_name);
}

/** INSERT: so preenche o display_name quando vem vazio. */
export function displayNameOnInsert(row: EntityNameRow): string | null {
  if (normalizeName(row.display_name) !== "") return row.display_name;
  return entityDisplayNameRule(row) ?? row.display_name;
}

/** UPDATE: o display_name que fica gravado. */
export function displayNameOnUpdate(oldRow: EntityNameRow, newRow: EntityNameRow): string | null {
  if (newRow.display_name !== oldRow.display_name) return newRow.display_name; // (a) explicito
  if (newRow.first_name === oldRow.first_name && newRow.last_name === oldRow.last_name) {
    return newRow.display_name; // o gatilho so escuta first_name/last_name
  }
  if (!isEntityNameInSync(oldRow)) return newRow.display_name; // (b) fora de sincronia
  const next = entityDisplayNameRule(newRow);
  const oldNorm = normalizeName(oldRow.display_name);
  return next !== null && next !== oldNorm ? next : newRow.display_name; // (c)
}
