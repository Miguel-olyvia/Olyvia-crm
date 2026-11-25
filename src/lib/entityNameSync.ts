/**
 * Espelho em TS do que a BASE faz ao nome da ficha (migrations
 * 20261229910000_nome_unico_da_ficha: funcoes e RPC; e
 * 20261229920000_nome_unico_da_ficha_gatilhos: o gatilho). Nao e usado pelos
 * ecras para gravar: serve para fixar, em testes, a regra das duas partes.
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
  if (newRow.type !== oldRow.type) return newRow.display_name; // (b) tipo so pela RPC
  if (!isValueChange(oldRow, newRow)) return newRow.display_name; // (c) preencher nao renomeia
  if (!isEntityNameInSync(oldRow)) return newRow.display_name; // (d) fora de sincronia
  const next = composeEntityName(newRow);
  const changed = next !== null && next.toLowerCase() !== normalizeName(oldRow.display_name).toLowerCase();
  return changed ? next : newRow.display_name; // (e) sem contar maiusculas
}

/** (c) Mudou o valor de um campo que ja tinha valor (nao um preenchimento). */
function isValueChange(oldRow: EntityNameRow, newRow: EntityNameRow): boolean {
  if (oldRow.type === "person") {
    if (!normalizeName(oldRow.first_name) || !normalizeName(oldRow.last_name)) return false;
    return newRow.first_name !== oldRow.first_name || newRow.last_name !== oldRow.last_name;
  }
  if (oldRow.type === "organization") {
    if (!normalizeName(oldRow.company_name)) return false;
    return newRow.company_name !== oldRow.company_name;
  }
  return false;
}

/** Limites como neg_guardar_identidade_pessoa. */
export const COMPANY_NAME_MAX = 200;
export const PERSON_NAME_PART_MAX = 100;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

export interface SetEntityKindRequest {
  type: string;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
}

export type SetEntityKindResult =
  | { ok: true; row: EntityNameRow }
  | { ok: false; error: "tipo_invalido" | "valor_invalido" | "empresa_obrigatoria" | "nome_obrigatorio" };

function isInvalidPart(value: string | null, max: number): boolean {
  return value !== null && (value.length > max || CONTROL_CHARS.test(value));
}

/** Espelho da decisao de rpc_set_entity_kind (sem permissoes nem auditoria). */
export function setEntityKind(before: EntityNameRow, request: SetEntityKindRequest): SetEntityKindResult {
  if (request.type !== "person" && request.type !== "organization") return { ok: false, error: "tipo_invalido" };
  let first = normalizeName(request.first_name) || null;
  let last = normalizeName(request.last_name) || null;
  let company = normalizeName(request.company_name) || null;
  if (
    isInvalidPart(company, COMPANY_NAME_MAX) ||
    isInvalidPart(first, PERSON_NAME_PART_MAX) ||
    isInvalidPart(last, PERSON_NAME_PART_MAX)
  ) {
    return { ok: false, error: "valor_invalido" };
  }
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
