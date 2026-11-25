/**
 * Espelho em TS do que a BASE faz ao nome da ficha (migration
 * 20261229910000_nome_unico_da_ficha). Nao e usado pelos ecras para gravar:
 * serve para fixar, em testes, a regra das funcoes, do gatilho e da RPC.
 *
 * Regra do dono: a ficha e PESSOA (nome = nome + apelido) ou EMPRESA (nome =
 * nome da empresa). O nome e um so (display_name); editar troca-o. Um
 * display_name explicito e respeitado; o gatilho so recompoe uma ficha que
 * estava «em sincronia».
 */
import { composeDisplayName } from "@/utils/composeDisplayName";

export type EntityKind = "person" | "organization";

export interface EntityNameRow {
  type: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
}

/** Espacos e NBSP colapsados e aparados, como normalizeFirstLast. */
export function normalizeName(value: string | null | undefined): string {
  return (value || "").replace(/[\s\u00a0]+/g, " ").trim();
}

/** Espelho de fn_entity_compose_name: composicao ESTRITA (null se nada). */
export function composeEntityName(
  row: Pick<EntityNameRow, "type" | "first_name" | "last_name" | "company_name">,
): string | null {
  if (row.type === "organization") return normalizeName(row.company_name) || null;
  if (row.type !== "person") return null;
  return composeDisplayName(normalizeName(row.first_name), normalizeName(row.last_name)) || null;
}

/** Espelho de fn_entity_display_name: a composicao, ou o nome actual. */
export function entityDisplayNameRule(row: EntityNameRow): string | null {
  return composeEntityName(row) ?? row.display_name;
}

/** Em sincronia: o nome (normalizado) e a composicao estrita pelo tipo. */
export function isEntityNameInSync(row: EntityNameRow): boolean {
  const composed = composeEntityName(row);
  return composed !== null && composed === normalizeName(row.display_name);
}

/** Gatilho, INSERT: so preenche o display_name quando vem vazio. */
export function displayNameOnInsert(row: EntityNameRow): string | null {
  if (normalizeName(row.display_name) !== "") return row.display_name;
  return entityDisplayNameRule(row);
}

/** Gatilho, UPDATE: o display_name que fica gravado. */
export function displayNameOnUpdate(oldRow: EntityNameRow, newRow: EntityNameRow): string | null {
  if (newRow.display_name !== oldRow.display_name) return newRow.display_name; // (a) explicito
  const composing = ["first_name", "last_name", "company_name", "type"] as const;
  if (composing.every((key) => newRow[key] === oldRow[key])) return newRow.display_name; // (b)
  if (!isEntityNameInSync(oldRow)) return newRow.display_name; // (c) fora de sincronia
  const next = composeEntityName(newRow);
  return next !== null && next !== normalizeName(oldRow.display_name) ? next : newRow.display_name; // (d)
}

export interface SetEntityKindRequest {
  type: string;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
}

export type SetEntityKindResult =
  | { ok: true; row: EntityNameRow }
  | { ok: false; error: "tipo_invalido" | "empresa_obrigatoria" | "nome_obrigatorio" };

/** Espelho da decisao de rpc_set_entity_kind (sem permissoes nem auditoria). */
export function setEntityKind(before: EntityNameRow, request: SetEntityKindRequest): SetEntityKindResult {
  if (request.type !== "person" && request.type !== "organization") return { ok: false, error: "tipo_invalido" };
  let first = normalizeName(request.first_name) || null;
  let last = normalizeName(request.last_name) || null;
  let company = normalizeName(request.company_name) || null;
  if (request.type === "organization" && !company) return { ok: false, error: "empresa_obrigatoria" };
  if (request.type === "person" && !first && !last) return { ok: false, error: "nome_obrigatorio" };

  if (request.type === "organization") {
    first = first ?? before.first_name;
    last = last ?? before.last_name;
  } else {
    company = company ?? before.company_name;
  }
  const name = composeEntityName({ type: request.type, first_name: first, last_name: last, company_name: company });
  if (!name) return { ok: false, error: "nome_obrigatorio" };
  return {
    ok: true,
    row: { type: request.type, display_name: name, first_name: first, last_name: last, company_name: company },
  };
}
