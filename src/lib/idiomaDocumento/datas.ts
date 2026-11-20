// Datas, durações e numeração de páginas por idioma. Só as PALAVRAS mudam: as datas numéricas e o dinheiro
// ficam como estão (o português é exatamente o de src/utils/contractVariables.ts de antes de existir idioma).

import { tDoc } from "./dicionario";
import { localeDoIdioma } from "./registo";

/** «13 de Março de 2026» / «13 March 2026». Sem data, o travessão. */
export function dataPorExtenso(data: string | Date | null | undefined, codigo: string = "pt"): string {
  if (!data) return "—";
  const d = new Date(data);
  const mesIndice = d.getMonth();
  // Data inválida: o português de hoje escreve «NaN de undefined de NaN» — mantém-se igual.
  const mes = mesIndice >= 0 && mesIndice <= 11 ? tDoc(codigo, `doc.mes.${mesIndice + 1}`) : undefined;
  return tDoc(codigo, "doc.data", { dia: d.getDate(), mes, ano: d.getFullYear() });
}

const MS_POR_DIA = 1000 * 60 * 60 * 24;

/** «12 meses» / «12 months»; abaixo de um mês, os dias. Sem uma das datas, o travessão. */
export function duracaoEntre(
  inicio: string | null | undefined,
  fim: string | null | undefined,
  codigo: string = "pt",
): string {
  if (!inicio || !fim) return "—";
  const start = new Date(inicio);
  const end = new Date(fim);
  const meses = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (meses <= 0) {
    const dias = Math.ceil((end.getTime() - start.getTime()) / MS_POR_DIA);
    return tDoc(codigo, dias === 1 ? "doc.duracao.diaUm" : "doc.duracao.dias", { n: dias });
  }
  return tDoc(codigo, meses === 1 ? "doc.duracao.mesUm" : "doc.duracao.meses", { n: meses });
}

/** «Página 2 de 5» / «Page 2 of 5». */
export function paginaXdeY(codigo: string, x: number, y: number): string {
  return tDoc(codigo, "doc.pagina", { x, y });
}

/** A data e hora do carimbo da assinatura, com o mês por extenso no idioma (português: pt-PT, como hoje). */
export function dataHoraDoCarimbo(iso: string | null | undefined, codigo: string = "pt"): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(localeDoIdioma(codigo), {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
