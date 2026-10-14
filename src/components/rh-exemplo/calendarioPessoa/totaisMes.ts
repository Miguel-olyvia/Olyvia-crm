/**
 * Os totais de um mes da pessoa, somados dia a dia a partir de `montarMes`. E a MESMA conta que o Calculo do mes
 * usa (horas planeadas, faltas, horas extra, dias com direito a subsidio de alimentacao): o cabecalho do calendario
 * e o recibo nunca divergem porque nao ha duas contas.
 *
 * O saldo so existe no banco de horas. Para os outros tipos de horario `bancoSaldoMin` e `null`: nao ha saldo.
 */
import type { DiaCalendario } from "./montarMes";

export interface TotaisMes {
  /** O que o horario previa no mes inteiro (feriados e ausencias incluidos): a base do valor da hora. */
  horasPlaneadasMin: number;
  /** Horas previstas ate ontem (sem feriados nem ausencias). */
  previstoMin: number;
  /** Horas feitas ate ontem (na isencao presume-se o previsto). */
  feitoMin: number;
  extraPendenteMin: number;
  extraConfirmadaMin: number;
  extraRejeitadaMin: number;
  /** Pendentes + confirmadas: o que o cabecalho mostra como «extra». */
  extraMin: number;
  /** Faltas marcadas. */
  faltasMin: number;
  /** Tempo em falta que ainda ninguem marcou. */
  faltasSugeridasMin: number;
  diasComFalta: number;
  diasElegiveisSubsidio: number;
  emBanco: boolean;
  bancoSaldoMin: number | null;
}

export interface OpcoesTotais {
  /** Minutos feitos num dia para ter direito ao subsidio de alimentacao. */
  minimoSubsidioMin: number;
  /** O saldo do banco de horas; ignorado quando o horario nao e de banco de horas. */
  bancoSaldoMin?: number;
}

/** Na isencao nao ha picagens: um dia de trabalho que ja passou conta como cumprido. */
export function feitoParaTotais(dia: DiaCalendario): number {
  const p = dia.previsto;
  if (p.tipo === "isencao" && p.kind === "trabalha" && dia.passado) return p.minutos;
  return dia.feitoMin;
}

const soma = (dias: readonly DiaCalendario[], f: (d: DiaCalendario) => number): number => dias.reduce((s, d) => s + f(d), 0);

export function totaisDoMes(dias: readonly DiaCalendario[], opcoes: OpcoesTotais): TotaisMes {
  const passados = dias.filter((d) => d.passado);
  const he = dias.flatMap((d) => d.horasExtra);
  const minutosHE = (estado: string): number => he.filter((h) => h.estado === estado).reduce((s, h) => s + h.minutos, 0);
  const emBanco = dias.some((d) => d.previsto.tipo === "banco");
  const extraPendenteMin = minutosHE("pendente");
  const extraConfirmadaMin = minutosHE("confirmada");
  return {
    horasPlaneadasMin: soma(dias, (d) => d.previsto.minutosHorario),
    previstoMin: soma(passados, (d) => d.previsto.minutosParaTotais),
    feitoMin: soma(passados, feitoParaTotais),
    extraPendenteMin,
    extraConfirmadaMin,
    extraRejeitadaMin: minutosHE("rejeitada"),
    extraMin: extraPendenteMin + extraConfirmadaMin,
    faltasMin: soma(dias, (d) => d.faltas.reduce((s, f) => s + f.minutos, 0)),
    faltasSugeridasMin: soma(dias, (d) => d.chips.filter((c) => c.tipo === "falta_sugerida").reduce((s, c) => s + c.minutos, 0)),
    diasComFalta: dias.filter((d) => d.faltas.length > 0 || d.chips.some((c) => c.tipo === "falta_sugerida")).length,
    diasElegiveisSubsidio: dias.filter((d) => (d.passado || d.hoje) && feitoParaTotais(d) >= opcoes.minimoSubsidioMin).length,
    emBanco,
    bancoSaldoMin: emBanco ? (opcoes.bancoSaldoMin ?? 0) : null,
  };
}
