import type { DecisaoJustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";

/** O que a base devolveu ao decidir e interessa ao texto: o mês do dia já estava fechado? */
export interface ResultadoDecisaoDia {
  mesFechado: boolean;
}

/** O texto de confirmação de uma decisão; num mês fechado diz que o desconto não muda sem reabrir. */
export function textoDaDecisao(t: (chave: string) => string, decisao: DecisaoJustificacaoDia, resultado: ResultadoDecisaoDia): string {
  const feito = t(`rhJust.rh.feito.${decisao}`);
  return resultado.mesFechado && decisao !== "recusar" ? `${feito} ${t("rhJust.rh.mesFechado")}` : feito;
}
