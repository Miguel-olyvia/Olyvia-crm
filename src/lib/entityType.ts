/**
 * Tipo da ficha: `anew_entities.type` so tem dois valores, 'person' e
 * 'organization'. Nao existe 'company' -- comparar com ele nunca coincide.
 *
 * O `client_type` de `anew_clients` e outra coisa: guarda 'company' ou
 * 'person'. `clientTypeForEntity` faz a ponte entre os dois.
 */
export function isOrganizationEntity(type: string | null | undefined): boolean {
  return type === "organization";
}

export function clientTypeForEntity(type: string | null | undefined): "company" | "person" {
  return isOrganizationEntity(type) ? "company" : "person";
}
