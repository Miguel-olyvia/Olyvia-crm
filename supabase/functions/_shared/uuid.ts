/** UUID em texto (qualquer versao), como o Postgres os escreve. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function eUuid(valor: unknown): valor is string {
  return typeof valor === "string" && UUID_RE.test(valor);
}
