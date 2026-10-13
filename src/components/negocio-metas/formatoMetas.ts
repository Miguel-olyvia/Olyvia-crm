import { formatCurrency } from "@/lib/utils";
import type { CartaoMeta } from "./negocioMetas";

/** Formata `atual` e `meta` conforme a unidade do cartão. */
export function formatarMeta(unidade: CartaoMeta["unidade"], valor: number): string {
  if (unidade === "euro") return formatCurrency(valor, true).replace(/,00$/, "");
  if (unidade === "percentagem") return `${valor}%`;
  return String(valor);
}

/** Os milhares de um valor, para os chips ("62", "8,6": uma casa decimal abaixo de 10 mil); a unidade vem do texto da página. */
export function formatarMilhares(valor: number): string {
  const milhares = valor / 1000;
  return milhares.toLocaleString("pt-PT", { maximumFractionDigits: milhares >= 10 ? 0 : 1 });
}
