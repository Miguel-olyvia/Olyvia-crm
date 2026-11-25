/**
 * Espelho em TS do que a BASE faz ao nome da ficha (migrations
 * 20261229910000 e 20261229920000, nome unico da ficha). Nao e usado pelos
 * ecras para gravar: serve para fixar, em testes, as regras dos gatilhos.
 *
 * Principio (decisao D2): nenhum nome existente muda por causa da base. O
 * gatilho da ficha e um guarda-livros: so recompoe uma ficha que estava em
 * sincronia; o gatilho da lead so regista a empresa, nunca renomeia.
 */
import { composeEntityDisplayName } from "@/lib/entityDisplayName";

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

const compose = (row: EntityNameRow): string | null =>
  composeEntityDisplayName(row.type, row.first_name, row.last_name, row.company_name);

/** A ficha esta em sincronia se o nome e a composicao das suas colunas. */
export function isEntityNameInSync(row: EntityNameRow): boolean {
  const composed = compose(row);
  return composed !== null && composed === normalizeName(row.display_name);
}

/** INSERT: so preenche o display_name quando vem vazio. */
export function displayNameOnInsert(row: EntityNameRow): string | null {
  if (normalizeName(row.display_name) !== "") return row.display_name;
  return compose(row) ?? row.display_name;
}

/** UPDATE: o display_name que fica gravado. */
export function displayNameOnUpdate(oldRow: EntityNameRow, newRow: EntityNameRow): string | null {
  if (newRow.display_name !== oldRow.display_name) return newRow.display_name; // (a) explicito
  if (newRow.first_name === oldRow.first_name && newRow.last_name === oldRow.last_name) {
    return newRow.display_name; // o gatilho so escuta first_name/last_name
  }
  if (!isEntityNameInSync(oldRow)) return newRow.display_name; // (b)
  const next = compose(newRow);
  const oldNorm = normalizeName(oldRow.display_name);
  return next !== null && next !== oldNorm ? next : newRow.display_name; // (c)
}

/**
 * Gatilho da lead: o company_name a registar na ficha, ou null para nao mexer.
 * `oldLeadCompany` e undefined numa lead nova (ou quando a lead mudou de ficha).
 * `sharedOutsideRoot`: a ficha aparece noutra organizacao-raiz.
 */
export function companyNameFromLead(params: {
  entity: Pick<EntityNameRow, "display_name" | "company_name">;
  leadCompany: string | null | undefined;
  oldLeadCompany?: string | null;
  sharedOutsideRoot: boolean;
}): string | null {
  const company = normalizeName(params.leadCompany) || null;
  if (company === null) return null; // vazio nunca apaga
  const isNew = params.oldLeadCompany === undefined;
  if (!isNew && (normalizeName(params.oldLeadCompany) || null) === company) return null;
  if (params.entity.company_name === company) return null;
  if (isNew && (params.entity.company_name !== null || params.entity.display_name !== company)) {
    return null;
  }
  if (params.sharedOutsideRoot) return null;
  return company;
}

/** Preenchimento da migration: a empresa so onde ela ja e o nome da ficha. */
export function companyNameToBackfill(
  entity: Pick<EntityNameRow, "display_name" | "company_name">,
  leadCompanies: Array<string | null | undefined>,
  sharedOutsideRoot: boolean,
): string | null {
  if (entity.company_name !== null || sharedOutsideRoot) return null;
  const distinct = new Set(leadCompanies.map((c) => normalizeName(c)).filter(Boolean));
  if (distinct.size !== 1) return null;
  const [company] = [...distinct];
  return entity.display_name === company ? company : null;
}
