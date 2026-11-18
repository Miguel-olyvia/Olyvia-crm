// Pequenas ajudas de texto partilhadas pelo núcleo (sem dependências).

export function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** O texto sem tags, com espaços normalizados (&nbsp; incluído). */
export function textoSimples(html: unknown): string {
  if (typeof html !== "string") return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|\u00A0/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Texto (já sem tags) com pelo menos um carácter. */
export function temTexto(valor: unknown): valor is string {
  return textoSimples(valor).length > 0;
}

/** String com pelo menos um carácter que não seja espaço. */
export function naoVazio(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim().length > 0;
}

/** Dois textos são «o mesmo» quando só diferem em tags e espaços. */
export function mesmoTexto(a: unknown, b: unknown): boolean {
  return textoSimples(a) === textoSimples(b);
}
