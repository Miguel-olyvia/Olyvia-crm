/** Formatação do separador Custo: euros ao cêntimo e a unidade de cada tipo de valor avulso. */
const EUROS = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });

/** Um valor em euros; `null` (custo sem valor) devolve `semValor`. */
export function euros(valor: number | null, semValor: string): string {
  return valor === null ? semValor : EUROS.format(valor);
}

/** «2026-11» para o nome do mês, na língua dada. */
export function nomeDoMes(mes: string, lingua: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, m - 1, 1)).toLocaleDateString(lingua === "pt" ? "pt-PT" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
