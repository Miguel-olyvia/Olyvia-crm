/**
 * Nome do cliente: UMA regra para todos os ecras e para os PDFs.
 *
 * A ficha (anew_entities) ja traz o nome pronto em `display_name`, que o sistema
 * compoe assim: nome da empresa se existir, senao nome + apelido. Por isso o
 * `display_name` manda SEMPRE que estiver preenchido, seja a ficha `person` ou
 * `organization` -- o tipo nao entra na escolha. So quando nao existe e que se
 * compoe, por esta ordem: empresa, nome + apelido, e por fim o que o ecra ja
 * tinha como ultimo recurso (`fallback`).
 *
 * Antes cada ecra escolhia a sua regra (alguns so usavam o display_name quando
 * a ficha era 'organization') e a mesma proposta aparecia com dois nomes.
 */
import { composeDisplayName } from "@/utils/composeDisplayName";

export interface EntityNameSource {
  display_name?: string | null;
  company_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

const clean = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const collapse = (value: string | null | undefined): string =>
  (value || "").replace(/\s+/g, " ").trim();

/**
 * Nome que a BASE grava na ficha. Espelho exacto de
 * public.fn_entity_display_name (migration 20261229910000_nome_unico_da_ficha):
 * empresa se houver; senao, numa pessoa, nome + apelido (composeDisplayName);
 * senao null, que quer dizer «fica o display_name que la esta» (organizacao
 * sem empresa, ou pessoa sem nome nem apelido).
 */
export function composeEntityDisplayName(
  type: string | null | undefined,
  first: string | null | undefined,
  last: string | null | undefined,
  company: string | null | undefined,
): string | null {
  const c = collapse(company);
  if (c) return c;
  if (type !== "person") return null;
  return composeDisplayName(first, last) || null;
}

/**
 * O mesmo, para uma PESSOA e sempre com texto: a empresa se existir, senao
 * nome + apelido, e vazio se nao ha nada. E o que os ecras mandam gravar
 * (editar nome, apelido ou empresa troca o nome, nunca acrescenta outro).
 */
export function composeNameForSave(parts: {
  company?: string | null;
  first?: string | null;
  last?: string | null;
}): string {
  return composeEntityDisplayName("person", parts.first, parts.last, parts.company) ?? "";
}

export function getEntityDisplayName(
  source: EntityNameSource | null | undefined,
  fallback = "",
): string {
  if (!source) return fallback;
  return (
    clean(source.display_name) ||
    clean(source.company_name) ||
    [clean(source.first_name), clean(source.last_name)].filter(Boolean).join(" ") ||
    fallback
  );
}
