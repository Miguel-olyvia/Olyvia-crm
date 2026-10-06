/**
 * O nome, para o ecra, de um campo da admissao a partir do seu codigo.
 *
 * Os codigos que dizem "o que falta" vem do servidor (a base e a Edge
 * Function). Um codigo fora do catalogo (campo novo no servidor, ainda sem
 * traducao no cliente) mostrava a chave crua (`hr.pendencias.campo.xyz`).
 * Aqui cai num texto generico traduzido: nunca uma chave de traducao no ecra.
 */
import type { TraduzirFn } from "@/lib/hr/errosAdmissao";

const CHAVE_DESCONHECIDO = "hr.pendencias.campo.desconhecido";

export function rotuloDeCampoAdmissao(t: TraduzirFn, codigo: string): string {
  const chave = `hr.pendencias.campo.${codigo}`;
  const texto = t(chave);
  // `useTranslation` devolve a propria chave quando nenhuma lingua a tem.
  return texto === chave ? t(CHAVE_DESCONHECIDO) : texto;
}
