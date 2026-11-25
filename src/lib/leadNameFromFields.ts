/**
 * Nome da ficha ao CRIAR uma lead a partir do formulario, pelo tipo escolhido.
 *
 * Pessoa: nome + apelido. Empresa: so o nome da empresa. O campo da empresa
 * nunca se junta ao nome da pessoa (antes saia «Rui Costa Empresa Lda»).
 */
import { composeDisplayName } from "@/utils/composeDisplayName";
import type { EntityKind } from "@/lib/entityKind";

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
  /** Nome da empresa escrito (vazio se nao ha). */
  company: string;
}

// Mesmos nomes de campo que o dialogo de edicao da lead usa (AnewLeadEditDialog).
const COMPANY_KEYS = new Set(["company_name", "empresa", "company", "nome_empresa", "organizacao", "organização"]);

export const isLeadCompanyField = (def: LeadNameFieldDef): boolean => {
  const key = def.field_key.toLowerCase();
  if (def.contact_field_mapping === "company_name" || COMPANY_KEYS.has(key)) return true;
  return def.field_type === "text"
    && (key.includes("nome") || key.includes("name"))
    && (key.includes("empresa") || key.includes("company") || key.includes("organiza"));
};

export const isLeadPersonNameField = (def: LeadNameFieldDef): boolean => {
  if (isLeadCompanyField(def)) return false;
  const m = def.contact_field_mapping;
  if (m === "first_name" || m === "last_name" || m === "full_name") return true;
  const key = def.field_key.toLowerCase();
  return def.field_type === "text" && (key.includes("nome") || key.includes("name"));
};

export function resolveLeadNames(
  defs: readonly LeadNameFieldDef[],
  values: Record<string, unknown>,
  kind: EntityKind = "person",
): LeadNames {
  let person = "";
  let company = "";
  let mappedFirst = "";
  let mappedLast = "";

  for (const def of defs) {
    const raw = values[def.field_key];
    if (!raw) continue;
    const val = String(raw).trim();
    if (!val) continue;
    if (isLeadCompanyField(def)) {
      if (!company) company = val.replace(/\s+/g, " ");
      continue;
    }
    if (!isLeadPersonNameField(def)) continue;

    if (def.contact_field_mapping === "first_name") mappedFirst = val;
    if (def.contact_field_mapping === "last_name") mappedLast = val;
    person = composeDisplayName(person, val);
  }

  if (kind === "organization") {
    return { displayName: company, firstName: null, lastName: null, company };
  }
  const tokens = person.split(" ").filter(Boolean);
  return {
    displayName: person,
    firstName: mappedFirst || tokens[0] || null,
    lastName: mappedLast || (tokens.length > 1 ? tokens.slice(1).join(" ") : null),
    company,
  };
}
