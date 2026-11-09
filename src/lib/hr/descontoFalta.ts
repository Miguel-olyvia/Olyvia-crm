/**
 * A regra do desconto de uma falta, UMA so para o cartao da falta e para o processamento salarial.
 * Funcoes puras, sem React nem I/O.
 *
 * Desconta a falta MARCADA (`pessoas_faltas`) que NAO seja justificada e paga: sem justificacao, recusada,
 * justificada nao paga, ou pendente de documento (provisoriamente), mais os atrasos acima da tolerancia.
 * Falta anulada ou corrigida nao desconta. Um dia sem falta marcada nunca desconta aqui.
 */
import type { EstadoFalta, EstadoJustificacao, MotivoFalta } from "@/types/hrAssiduidade";

/** Atraso ate este valor (minutos) nao desconta. Igual a `TOLERANCIA_ATRASO_MINUTOS` do exemplo (ha um teste a conferir). */
export const TOLERANCIA_ATRASO_MINUTOS = 5;

export type RazaoDesconto =
  | "anulada"
  | "justificada_paga"
  | "atraso_dentro_tolerancia"
  | "sem_justificacao"
  | "pendente_documento"
  | "justificada_nao_paga"
  | "recusada";

export interface DescontoDaFalta {
  desconta: boolean;
  minutos: number;
  valor: number;
  razao: RazaoDesconto;
  /** Pendente de documento: conta ja, mas pode deixar de contar se for justificada e paga. */
  provisorio: boolean;
}

export interface FaltaParaDesconto {
  minutos: number;
  estado: EstadoFalta;
  justificacao_estado: EstadoJustificacao;
  remunerada: boolean;
  motivo_codigo: MotivoFalta;
}

/** Uma falta em vigor do periodo, com a data para a agrupar por dia. */
export interface FaltaDoPeriodo extends FaltaParaDesconto {
  data: string;
  /** Falta SINTETICA de um dia planeado sem falta e sem picagem (so conta para o aviso quando nao houve picagem nenhuma). */
  semRegisto?: boolean;
  /** Falta SINTETICA do planeado coberto por uma ausencia aprovada NAO remunerada (licenca sem vencimento). */
  ausenciaNaoPaga?: boolean;
}

const arredondar = (valor: number): number => Math.round((valor + Number.EPSILON) * 100) / 100;

export function descontoDaFalta(
  falta: FaltaParaDesconto,
  valorHora: number,
  tolerancia: number = TOLERANCIA_ATRASO_MINUTOS,
): DescontoDaFalta {
  const sem = (razao: RazaoDesconto): DescontoDaFalta => ({ desconta: false, minutos: 0, valor: 0, razao, provisorio: false });
  if (falta.estado !== "activa") return sem("anulada");
  if (falta.justificacao_estado === "justificada" && falta.remunerada) return sem("justificada_paga");
  if (falta.motivo_codigo === "atraso" && falta.minutos <= tolerancia) return sem("atraso_dentro_tolerancia");
  const razao: RazaoDesconto =
    falta.justificacao_estado === "justificada" ? "justificada_nao_paga" : (falta.justificacao_estado as RazaoDesconto);
  return {
    desconta: true,
    minutos: falta.minutos,
    valor: arredondar((falta.minutos / 60) * valorHora),
    razao,
    provisorio: falta.justificacao_estado === "pendente_documento",
  };
}

export function totalDeDescontos(faltas: FaltaParaDesconto[], valorHora: number, tolerancia?: number): number {
  return arredondar(faltas.reduce((soma, f) => soma + descontoDaFalta(f, valorHora, tolerancia).valor, 0));
}

export interface DescontoDasFaltas {
  valor: number;
  /** Alguma falta que desconta esta pendente de documento (o desconto e provisorio). */
  provisorio: boolean;
}

/**
 * O desconto de faltas do periodo: a soma de `descontoDaFalta` POR FALTA (cada uma arredondada ao centimo). Nao ha
 * compensacao entre dias: as horas extra de um dia nunca pagam uma falta de outro.
 *
 * `limitePorDia` (data ISO -> minutos): o maximo de minutos de falta que o dia pode ter (depois de tirar o que uma ausencia
 * aprovada e remunerada ja cobre; numa ausencia nao remunerada, o planeado do dia). Gastam esse limite, pela ordem em que
 * chegam, SO as faltas que descontam: uma justificada e paga nao consome o limite das outras.
 */
export function descontoDasFaltas(
  faltas: readonly FaltaDoPeriodo[],
  valorHora: number,
  limitePorDia: Readonly<Record<string, number>> = {},
  tolerancia?: number,
): DescontoDasFaltas {
  const restante = new Map<string, number>();
  let valor = 0;
  let provisorio = false;
  for (const falta of faltas) {
    const limite = limitePorDia[falta.data];
    let minutos = falta.minutos;
    if (limite !== undefined && descontoDaFalta(falta, valorHora, tolerancia).desconta) {
      const sobra = restante.get(falta.data) ?? Math.max(limite, 0);
      minutos = Math.min(minutos, sobra);
      restante.set(falta.data, sobra - minutos);
    }
    const desconto = descontoDaFalta({ ...falta, minutos }, valorHora, tolerancia);
    valor += desconto.valor;
    if (desconto.desconta && desconto.provisorio) provisorio = true;
  }
  return { valor: arredondar(valor), provisorio };
}

/** A assinatura das faltas usadas no calculo: muda sempre que uma falta, o seu estado ou a sua justificacao mudam. */
export function assinaturaDeFaltas(faltas: readonly FaltaDoPeriodo[]): string {
  return faltas
    .map((f) => `${f.data}|${f.minutos}|${f.estado}|${f.justificacao_estado}|${f.remunerada ? 1 : 0}|${f.motivo_codigo}`)
    .sort()
    .join(";");
}
