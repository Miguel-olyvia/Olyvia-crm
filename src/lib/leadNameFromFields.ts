/**
 * Nome da ficha ao CRIAR uma lead a partir do formulario: nome + apelido.
 *
 * Antes juntava todos os campos de texto cuja chave tivesse «name» ou «nome»,
 * e o campo da empresa (`company_name`, `nome_empresa`...) caia la dentro: saia
 * «Rui Costa Empresa Lda». A empresa e so um campo da lead e nao entra no nome.
 */
import { composeDisplayName } from "@/utils/composeDisplayName";

export interface LeadNameFieldDef {
  field_key: string;
  field_type?: string | null;
  contact_field_mapping?: string | null;
}

export interface LeadNames {
  /** O que vai para anew_entities.display_name (vazio se nao ha nada). */
  displayName: string;
  firstName: string | null;
  lastName: string | null;
}

// Mesmos nomes de campo que o dialogo de edicao da lead usa (AnewLeadEditDialog).
const COMPANY_KEYS = new Set(["company_name", "empresa", "company", "nome_empresa", "organizacao", "organização"]);

const isCompanyField = (def: LeadNameFieldDef): boolean => {
  const key = def.field_key.toLowerCase();
  if (def.contact_field_mapping === "company_name" || COMPANY_KEYS.has(key)) return true;
  return def.field_type === "text"
    && (key.includes("nome") || key.includes("name"))
    && (key.includes("empresa") || key.includes("company") || key.includes("organiza"));
};

const isPersonNameField = (def: LeadNameFieldDef): boolean => {
  const m = def.contact_field_mapping;
  if (m === "first_name" || m === "last_name" || m === "full_name") return true;
  const key = def.field_key.toLowerCase();
  return def.field_type === "text" && (key.includes("nome") || key.includes("name"));
};

export function resolveLeadNames(
  defs: readonly LeadNameFieldDef[],
  values: Record<string, unknown>,
): LeadNames {
  let person = "";
  let mappedFirst = "";
  let mappedLast = "";

  for (const def of defs) {
    const raw = values[def.field_key];
    if (!raw) continue;
    const val = String(raw).trim();
    if (!val) continue;
    if (isCompanyField(def) || !isPersonNameField(def)) continue;

    if (def.contact_field_mapping === "first_name") mappedFirst = val;
    if (def.contact_field_mapping === "last_name") mappedLast = val;
    person = composeDisplayName(person, val);
  }

  const tokens = person.split(" ").filter(Boolean);
  return {
    displayName: person,
    firstName: mappedFirst || tokens[0] || null,
    lastName: mappedLast || (tokens.length > 1 ? tokens.slice(1).join(" ") : null),
  };
}
