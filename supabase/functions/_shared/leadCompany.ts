/**
 * Empresa de uma lead e nome de uma ficha NOVA, para as Edge Functions publicas.
 *
 * A mesma regra do ecra (src/lib/leadNameFromFields.ts -> composeNameForSave) e
 * da base (fn_entity_display_name, migration 20261229910000): a empresa se
 * existir, senao nome + apelido. As chaves de empresa sao as do
 * AnewLeadEditDialog (GENERAL_FIELD_ALIASES.company_name), pela mesma ordem, e
 * as de fn_lead_company_from_field_values: com elas o gatilho da lead regista
 * company_name na ficha nova (o nome ja e a empresa).
 *
 * So se usa ao CRIAR a ficha. Uma ficha reaproveitada (encontrada por email ou
 * telefone) nunca e renomeada a partir de uma submissao.
 */
import { composeDisplayName } from './composeDisplayName.ts';

export const LEAD_COMPANY_KEYS = [
  'company_name',
  'empresa',
  'company',
  'nome_empresa',
  'organizacao',
  'organização',
] as const;

const collapse = (value: string): string => value.replace(/[\s\u00a0]+/g, ' ').trim();

const readValue = (raw: unknown): string | null => {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    return String(obj.address_line1 || obj.street || obj.value || '');
  }
  return String(raw);
};

/**
 * Empresa da lead, normalizada ('' se nao ha). `mappedKey` e o field_key que o
 * formulario mapeou para company_name (contact_field_mapping): ganha as chaves
 * fixas, como no ecra.
 */
export function leadCompanyFromFieldValues(
  values: Record<string, unknown> | null | undefined,
  mappedKey?: string | null,
): string {
  if (!values || typeof values !== 'object') return '';
  const keys = [mappedKey, ...LEAD_COMPANY_KEYS].filter((k): k is string => Boolean(k));
  for (const key of keys) {
    const value = readValue(values[key]);
    if (value === null) continue;
    return collapse(value);
  }
  return '';
}

/** Nome de uma ficha nova: empresa, senao nome + apelido ('' se nada). */
export function newLeadEntityDisplayName(parts: {
  company?: string | null;
  first?: string | null;
  last?: string | null;
}): string {
  const company = collapse(parts.company ?? '');
  if (company) return company;
  return composeDisplayName(parts.first, parts.last);
}
