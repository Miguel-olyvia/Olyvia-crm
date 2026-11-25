/**
 * Nome da ficha ao CRIAR uma lead a partir do formulario.
 *
 * Antes juntava todos os campos de texto cuja chave tivesse «name» ou «nome»,
 * e a empresa (`company_name`, `nome_empresa`...) caia la dentro: saia
 * «Rui Costa Empresa Lda». Agora segue a regra unica do nome do cliente: a
 * empresa se existir, senao nome + apelido (ver composeNameForSave).
 */
import { composeDisplayName } from "@/utils/composeDisplayName";
import { composeNameForSave } from "@/lib/entityDisplayName";

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
  company: string;
  /** Nome da pessoa (sem empresa), vazio se nao ha. */
  person: string;
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
  let company = "";
  let person = "";
  let mappedFirst = "";
  let mappedLast = "";

  for (const def of defs) {
    const raw = values[def.field_key];
    if (!raw) continue;
    const val = String(raw).trim();
    if (!val) continue;

    if (isCompanyField(def)) {
      if (!company) company = val;
      continue;
    }
    if (!isPersonNameField(def)) continue;
    if (def.contact_field_mapping === "first_name") mappedFirst = val;
    if (def.contact_field_mapping === "last_name") mappedLast = val;
    person = composeDisplayName(person, val);
  }

  const tokens = person.split(" ").filter(Boolean);
  const firstName = mappedFirst || tokens[0] || null;
  const lastName = mappedLast || (tokens.length > 1 ? tokens.slice(1).join(" ") : null);

  return {
    displayName: composeNameForSave({ company, first: person }),
    firstName,
    lastName,
    company,
    person,
  };
}
