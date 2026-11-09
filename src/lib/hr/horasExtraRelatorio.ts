/**
 * As horas extra APROVADAS no relatorio de assiduidade e no processamento. Funcoes puras, sem React nem base.
 *
 * O INTERRUPTOR (`hr_horas_extra_config.aprovacao_conta_desde`, lido por `rpc_hr_horas_extra_do_periodo`):
 *  - `null` (ou um dia ANTES da data): modo `bruto`, exactamente como sempre: o excesso sobre o planeado e a hora extra.
 *  - dia com data >= `aprovacaoDesde`: modo `aprovadas`: so contam as horas extra CONFIRMADAS (`pessoas_horas_extra`).
 *
 * O QUE CONTA NUM DIA EM MODO `aprovadas` (D2, D3, D7):
 *  - diaria e semanal (pagam-se como dia util): no maximo o liquido do dia, `max(realizado - planeado, 0)`. A deteccao mede o
 *    tempo FORA das janelas planeadas e o relatorio mede o excesso do total; o corte impede pagar mais do que se trabalhou a mais.
 *  - feriado e descanso: no maximo o realizado do dia.
 *  - banco: nao conta (nao existe); mostra-se a parte.
 *  - pendente e rejeitada: nao contam. As pendentes bloqueiam o fecho (D4), de QUALQUER origem (a base conta tambem as de banco).
 *  - dia de ausencia de dia inteiro: nada se paga (o dia nao entra nos totais); o confirmado fica em `confirmadoSemContarMin`.
 *  - o excesso que nao tem hora extra nenhuma (nem rejeitada) e «excesso por detetar»: nao paga e nao compensa faltas (D3).
 */

export type ModoExtra = "bruto" | "aprovadas";

/** Uma linha de `rpc_hr_horas_extra_do_periodo.linhas`. */
export interface LinhaHoraExtraPeriodo {
  id: string;
  data: string;
  /** `diaria` | `semanal` | `feriado` | `descanso` | `banco`. */
  origem: string;
  /** `pendente` | `confirmada` | `rejeitada` (a base chama «aprovada» a `confirmada`). */
  estado: string;
  minutos: number;
  nocturno_min: number;
  tipo_registo?: string | null;
}

/** O que `rpc_hr_horas_extra_do_periodo` devolve para uma pessoa e um periodo. */
export interface HorasExtraDoPeriodo {
  /** `null` = interruptor desligado (modo bruto em todos os dias). */
  aprovacaoDesde: string | null;
  linhas: readonly LinhaHoraExtraPeriodo[];
  /** A assinatura da base (md5) das linhas do periodo; `null` sem linhas. */
  assinatura: string | null;
}

export const SEM_HORAS_EXTRA_DO_PERIODO: HorasExtraDoPeriodo = { aprovacaoDesde: null, linhas: [], assinatura: null };

/** O modo de um dia: aprovadas so a partir da data do interruptor (inclusive). */
export function modoDoDia(aprovacaoDesde: string | null, iso: string): ModoExtra {
  return aprovacaoDesde !== null && iso >= aprovacaoDesde ? "aprovadas" : "bruto";
}

/** Os minutos que contam, por origem (o escalao de pagamento vem da origem, nao do estado do dia). */
export interface ExtraPorOrigem {
  diaria: number;
  semanal: number;
  feriado: number;
  descanso: number;
}

export const EXTRA_POR_ORIGEM_VAZIO: ExtraPorOrigem = { diaria: 0, semanal: 0, feriado: 0, descanso: 0 };

export interface EntradaExtraDoDia {
  modo: ModoExtra;
  /** O estado do dia no relatorio (`normal`, `descanso`, `feriado`, `ausencia`, `sem_registo`). */
  estado: string;
  planeadoMinutos: number;
  realizadoMinutos: number;
  /** As linhas de horas extra DESTE dia. */
  linhas: readonly LinhaHoraExtraPeriodo[];
  /** A margem de tempo em vigor neste dia (`null` = sem margem): o excesso dentro da margem nao e «por detetar». */
  margemMin?: number | null;
}

export interface ExtraDoDia {
  modo: ModoExtra;
  /** O que conta (e se paga) neste dia. Em modo `bruto` e 0: o excesso em bruto e calculado por quem chama, como sempre. */
  contaMin: number;
  porOrigem: ExtraPorOrigem;
  /** Dos minutos que contam, os que caem no periodo nocturno (nunca mais do que `contaMin`). */
  contaNocturnoMin: number;
  /** Pendentes (todas as origens, banco incluido, como a base): bloqueiam o fecho. */
  pendenteMin: number;
  /** Confirmado mas cortado pelo limite do dia (D2). */
  cortadoMin: number;
  /** Banco de horas (nao conta): so se mostra. */
  bancoMin: number;
  /** Excesso do dia que nao tem nenhuma hora extra (nem rejeitada): por detetar. */
  excessoSemHoraExtraMin: number;
  /** Confirmado num dia de ausencia de dia inteiro: nao se paga (o dia nao entra nos totais). */
  confirmadoSemContarMin: number;
}

const ZERO: Omit<ExtraDoDia, "modo"> = {
  contaMin: 0,
  porOrigem: EXTRA_POR_ORIGEM_VAZIO,
  contaNocturnoMin: 0,
  pendenteMin: 0,
  cortadoMin: 0,
  bancoMin: 0,
  excessoSemHoraExtraMin: 0,
  confirmadoSemContarMin: 0,
};

const soma = (linhas: readonly LinhaHoraExtraPeriodo[], campo: "minutos" | "nocturno_min"): number =>
  linhas.reduce((total, l) => total + Math.max(Number(l[campo]) || 0, 0), 0);

const deOrigem = (linhas: readonly LinhaHoraExtraPeriodo[], origem: string): readonly LinhaHoraExtraPeriodo[] =>
  linhas.filter((l) => l.origem === origem);

/** Quanto conta e quanto fica pendente, cortado ou por detetar num dia. Em modo `bruto` nao ha nada a dizer. */
export function extraDoDia(entrada: EntradaExtraDoDia): ExtraDoDia {
  if (entrada.modo === "bruto") return { modo: "bruto", ...ZERO };

  const confirmadas = entrada.linhas.filter((l) => l.estado === "confirmada" && l.origem !== "banco");
  const confirmado = (origem: string): number => soma(deOrigem(confirmadas, origem), "minutos");
  const liquido = Math.max(entrada.realizadoMinutos - entrada.planeadoMinutos, 0);
  const realizado = Math.max(entrada.realizadoMinutos, 0);

  // Dia de ausencia de dia inteiro: nao entra nos totais, por isso nada se paga; o confirmado mostra-se como «nao contado».
  const ausencia = entrada.estado === "ausencia";
  const diaria = ausencia ? 0 : Math.min(confirmado("diaria"), liquido);
  const semanal = ausencia ? 0 : Math.min(confirmado("semanal"), liquido - diaria);
  const feriado = ausencia ? 0 : Math.min(confirmado("feriado"), realizado);
  const descanso = ausencia ? 0 : Math.min(confirmado("descanso"), realizado - feriado);
  const contaMin = diaria + semanal + feriado + descanso;
  const totalConfirmado = confirmado("diaria") + confirmado("semanal") + confirmado("feriado") + confirmado("descanso");

  const pendenteMin = soma(entrada.linhas.filter((l) => l.estado === "pendente"), "minutos");
  const bancoMin = soma(entrada.linhas.filter((l) => l.origem === "banco" && l.estado !== "rejeitada"), "minutos");

  // «Por detetar»: ha excesso e nenhuma linha (de uma origem que conta, de qualquer estado) o explica.
  const temLinha = entrada.linhas.some((l) => l.origem !== "banco");
  const dentroDaMargem = entrada.margemMin !== null && entrada.margemMin !== undefined && liquido <= entrada.margemMin;
  const excessoSemHoraExtraMin = entrada.estado === "ausencia" || temLinha || dentroDaMargem ? 0 : liquido;

  return {
    modo: "aprovadas",
    contaMin,
    porOrigem: { diaria, semanal, feriado, descanso },
    contaNocturnoMin: Math.min(soma(confirmadas, "nocturno_min"), contaMin),
    pendenteMin,
    cortadoMin: ausencia ? 0 : Math.max(totalConfirmado - contaMin, 0),
    bancoMin,
    excessoSemHoraExtraMin,
    confirmadoSemContarMin: ausencia ? totalConfirmado : 0,
  };
}

/** As horas extra pendentes de um periodo, nos dias em modo `aprovadas` (as que bloqueiam o fecho). Todas as origens, banco incluido (como a base). */
export function pendentesDoPeriodo(horas: HorasExtraDoPeriodo): { n: number; minutos: number } {
  let n = 0;
  let minutos = 0;
  for (const l of horas.linhas) {
    if (l.estado !== "pendente") continue;
    if (modoDoDia(horas.aprovacaoDesde, l.data) !== "aprovadas") continue;
    n += 1;
    minutos += Math.max(Number(l.minutos) || 0, 0);
  }
  return { n, minutos };
}

/** As linhas de um dia (a leitura do periodo vem plana). */
export function linhasPorDia(linhas: readonly LinhaHoraExtraPeriodo[]): Map<string, LinhaHoraExtraPeriodo[]> {
  const porDia = new Map<string, LinhaHoraExtraPeriodo[]>();
  for (const l of linhas) {
    const lista = porDia.get(l.data);
    if (lista) lista.push(l);
    else porDia.set(l.data, [l]);
  }
  return porDia;
}

/** Em que modo se calculou um periodo: so bruto, so aprovadas, ou uma mistura (a data do interruptor cai a meio). */
export type FonteHorasExtra = "bruto" | "aprovadas" | "misto";

export function fonteDoPeriodo(modos: Iterable<ModoExtra>): FonteHorasExtra {
  let aprovadas = false;
  let bruto = false;
  for (const m of modos) {
    if (m === "aprovadas") aprovadas = true;
    else bruto = true;
  }
  if (aprovadas && bruto) return "misto";
  return aprovadas ? "aprovadas" : "bruto";
}
