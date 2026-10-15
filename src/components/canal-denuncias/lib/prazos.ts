// Prazos de referência do canal: confirmar a receção em 7 dias, responder sobre as medidas em 3 meses.
import { diasEntre, somarDias, somarMeses } from "./datas";
import type { Denuncia } from "./tipos";

export const DIAS_CONFIRMAR = 7;
export const MESES_RESPONDER = 3;
/** Quantos dias antes do fim o prazo passa a «a vencer». */
export const LIMIAR_A_VENCER = { confirmar: 3, responder: 14 } as const;

export const prazoConfirmacao = (recebidaEm: string): string => somarDias(recebidaEm, DIAS_CONFIRMAR);
export const prazoResposta = (recebidaEm: string): string => somarMeses(recebidaEm, MESES_RESPONDER);

export type SituacaoPrazo = "ok" | "a_vencer" | "atrasado";

export interface PrazoAtual {
  /** O prazo que está em curso: confirmar a receção ou responder; «nenhum» quando o caso está fechado. */
  tipo: "confirmar" | "responder" | "nenhum";
  data: string | null;
  situacao: SituacaoPrazo;
  /** Dias que faltam (negativo se já passou). */
  dias: number | null;
}

const SEM_PRAZO: PrazoAtual = { tipo: "nenhum", data: null, situacao: "ok", dias: null };

export function situacaoDoPrazo(dias: number, limiar: number): SituacaoPrazo {
  if (dias < 0) return "atrasado";
  return dias <= limiar ? "a_vencer" : "ok";
}

/** O prazo em curso de uma denúncia, em relação a `hoje`. */
export function prazoAtual(d: Pick<Denuncia, "estado" | "recebidaEm" | "confirmadaEm">, hoje: string): PrazoAtual {
  if (d.estado === "concluida" || d.estado === "arquivada") return SEM_PRAZO;
  const porConfirmar = d.estado === "recebida" && d.confirmadaEm === null;
  const tipo = porConfirmar ? "confirmar" : "responder";
  const data = porConfirmar ? prazoConfirmacao(d.recebidaEm) : prazoResposta(d.recebidaEm);
  const dias = diasEntre(hoje, data);
  return { tipo, data, dias, situacao: situacaoDoPrazo(dias, LIMIAR_A_VENCER[tipo]) };
}

export const prazoPorVencer = (p: PrazoAtual): boolean => p.situacao !== "ok";
