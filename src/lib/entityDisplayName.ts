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
export interface EntityNameSource {
  display_name?: string | null;
  company_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

const clean = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

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
