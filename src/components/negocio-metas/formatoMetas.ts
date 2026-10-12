import { formatCurrency } from "@/lib/utils";
import type { CartaoMeta } from "./negocioMetas";

/** Formata `atual` e `meta` conforme a unidade do cartão. */
export function formatarMeta(unidade: CartaoMeta["unidade"], valor: number): string {
  if (unidade === "euro") return formatCurrency(valor, true).replace(/,00$/, "");
  if (unidade === "percentagem") return `${valor}%`;
  return String(valor);
}
