/**
 * Horas extra (fluxo 6): funções PURAS, sem store nem ecrã.
 * O pipeline do documento, por esta ordem:
 *   1. tempo a mais, por tipo de horário
 *   2. mínimo de 15 minutos
 *   3. a pessoa tem a marca «pode fazer horas extra»
 *   4. limites (2 h/dia e 150 h/ano por omissão) e alerta a 80 %
 *   5. o RH confirma ou rejeita (rejeitar e passar um limite exigem motivo)
 * Tudo em minutos inteiros. O dinheiro vive em `pagamentoHorasExtra`.
 */

export type TipoHorarioHE = "normal" | "repartido" | "livre" | "isencao" | "banco_horas";
export type OrigemHoraExtra = "diaria" | "semanal" | "feriado" | "descanso" | "banco";
export type EstadoHoraExtra = "pendente" | "confirmada" | "rejeitada";
/** O que o RH vê numa linha: «acima do limite» é o estado de uma pendente marcada. */
export type EstadoVisivelHE = EstadoHoraExtra | "acima_limite";

export const MINIMO_HORA_EXTRA_MIN = 15;
export const MOTIVO_MINIMO_CARACTERES = 3;

export interface LimitesHE {
  /** Minutos por dia. */
  diaMin: number;
  /** Minutos por ano. */
  anoMin: number;
  /** Percentagem do limite a partir da qual se avisa (80 = 80 %). */
  alertaPct: number;
  /** Mínimo de tempo a mais para existir hora extra. */
  minimoMin: number;
}

export const LIMITES_OMISSAO: LimitesHE = { diaMin: 120, anoMin: 150 * 60, alertaPct: 80, minimoMin: MINIMO_HORA_EXTRA_MIN };

export interface HoraExtra {
  id: string;
  pessoaId: string;
  /** AAAA-MM-DD */
  data: string;
  minutos: number;
  /** Parte do tempo entre as 22:00 e as 07:00 (paga por cima). */
  nocturnoMin: number;
  origem: OrigemHoraExtra;
  /** Texto curto do que a originou, por exemplo «saiu às 19:30». */
  motivoOrigem: string;
  estado: EstadoHoraExtra;
  acimaDoLimite: boolean;
  motivoDecisao: string | null;
  decididoPor: string | null;
}

// -- 1. Tempo a mais por tipo de horário --------------------------------------------------------

export interface EntradaTempoAMais {
  tipo: TipoHorarioHE;
  /** Normal/repartido: o dia. Livre: a semana inteira. */
  feitoMin: number;
  planeadoMin: number;
  /** Feriado ou dia de descanso trabalhado, em qualquer tipo de horário. */
  diaEspecial: "feriado" | "descanso" | null;
  /** Banco de horas: o que passa do saldo máximo. */
  excessoSobreSaldoMaxMin?: number;
}

export interface TempoAMais {
  minutos: number;
  origem: OrigemHoraExtra | null;
}

const NADA: TempoAMais = { minutos: 0, origem: null };
const positivo = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

export function tempoAMaisPorTipo(e: EntradaTempoAMais): TempoAMais {
  // Feriado ou descanso, em qualquer tipo, contam o tempo inteiro trabalhado.
  if (e.diaEspecial) return { minutos: positivo(e.feitoMin), origem: e.diaEspecial };
  switch (e.tipo) {
    case "normal":
    case "repartido":
      return { minutos: positivo(e.feitoMin - e.planeadoMin), origem: "diaria" };
    case "livre":
      return { minutos: positivo(e.feitoMin - e.planeadoMin), origem: "semanal" };
    case "banco_horas":
      return { minutos: positivo(e.excessoSobreSaldoMaxMin ?? 0), origem: "banco" };
    case "isencao":
      return NADA;
  }
}

/** Minutos de [inicio, fim] (HH:MM) dentro da janela nocturna 22:00-07:00. */
export function minutosNocturnos(inicio: string, fim: string): number {
  const paraMin = (hhmm: string): number => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  const a = paraMin(inicio);
  let b = paraMin(fim);
  if ([a, b].some(Number.isNaN)) return 0;
  if (b < a) b += 24 * 60;
  // Janelas nocturnas num eixo de dois dias: [0,420) [1320,1860) [2760,3300)
  const janelas: Array<[number, number]> = [[0, 420], [1320, 1860], [2760, 3300]];
  return janelas.reduce((soma, [ini, fimJ]) => soma + Math.max(0, Math.min(b, fimJ) - Math.max(a, ini)), 0);
}

// -- 2 e 3. Mínimo e marca -----------------------------------------------------------------------

export type ResultadoPipeline = "sem_tempo" | "abaixo_minimo" | "sem_marca" | "cria_pendente";

export function avaliarCandidata(minutos: number, podeFazer: boolean, minimoMin: number): ResultadoPipeline {
  if (minutos <= 0) return "sem_tempo";
  if (minutos < minimoMin) return "abaixo_minimo";
  if (!podeFazer) return "sem_marca";
  return "cria_pendente";
}

// -- 4. Limites e alerta ------------------------------------------------------------------------

export interface ContagemLimites {
  /** Minutos já registados nesse dia (confirmadas + pendentes). */
  jaNoDiaMin: number;
  /** Minutos já registados no ano (confirmadas + pendentes). */
  jaNoAnoMin: number;
}

export interface AvaliacaoLimites {
  normaisMin: number;
  acimaDoLimiteMin: number;
  alertaDia: boolean;
  alertaAno: boolean;
}

const pontoDeAlerta = (limite: number, pct: number): number => (limite * pct) / 100;

export function avaliarLimites(novosMin: number, c: ContagemLimites, l: LimitesHE): AvaliacaoLimites {
  const totalDia = c.jaNoDiaMin + novosMin;
  const totalAno = c.jaNoAnoMin + novosMin;
  const acimaDia = Math.max(0, totalDia - Math.max(l.diaMin, c.jaNoDiaMin));
  const acimaAno = Math.max(0, totalAno - Math.max(l.anoMin, c.jaNoAnoMin));
  const acima = Math.min(novosMin, Math.max(acimaDia, acimaAno));
  return {
    normaisMin: novosMin - acima,
    acimaDoLimiteMin: acima,
    alertaDia: totalDia >= pontoDeAlerta(l.diaMin, l.alertaPct),
    alertaAno: totalAno >= pontoDeAlerta(l.anoMin, l.alertaPct),
  };
}

export interface SaldoLimites {
  anoMin: number;
  limiteAnoMin: number;
  pontoAlertaMin: number;
  restanteMin: number;
  emAlerta: boolean;
  acimaDoLimite: boolean;
}

/** Quanto a pessoa já gastou do limite anual: contam confirmadas e pendentes, nunca as rejeitadas. */
export function saldoDeLimites(horas: readonly HoraExtra[], pessoaId: string, ano: number, l: LimitesHE): SaldoLimites {
  const anoMin = horas
    .filter((h) => h.pessoaId === pessoaId && h.estado !== "rejeitada" && h.data.startsWith(`${ano}-`))
    .reduce((s, h) => s + h.minutos, 0);
  const pontoAlertaMin = pontoDeAlerta(l.anoMin, l.alertaPct);
  return {
    anoMin,
    limiteAnoMin: l.anoMin,
    pontoAlertaMin,
    restanteMin: Math.max(0, l.anoMin - anoMin),
    emAlerta: anoMin >= pontoAlertaMin,
    acimaDoLimite: anoMin > l.anoMin,
  };
}

// -- 5. Estado e decisão do RH ---------------------------------------------------------------------

export function estadoVisivel(h: Pick<HoraExtra, "estado" | "acimaDoLimite">): EstadoVisivelHE {
  return h.estado === "pendente" && h.acimaDoLimite ? "acima_limite" : h.estado;
}

export type ErroDecisao = "ja_decidida" | "motivo_obrigatorio";
export type ResultadoDecisao = { ok: true; hora: HoraExtra } | { ok: false; erro: ErroDecisao };

export const motivoValido = (motivo: string | null | undefined): boolean =>
  (motivo ?? "").trim().length >= MOTIVO_MINIMO_CARACTERES;

export function decidirHoraExtra(
  h: HoraExtra,
  decisao: "confirmar" | "rejeitar",
  motivo: string,
  quem: string,
): ResultadoDecisao {
  if (h.estado !== "pendente") return { ok: false, erro: "ja_decidida" };
  const exigeMotivo = decisao === "rejeitar" || h.acimaDoLimite;
  if (exigeMotivo && !motivoValido(motivo)) return { ok: false, erro: "motivo_obrigatorio" };
  return {
    ok: true,
    hora: {
      ...h,
      estado: decisao === "confirmar" ? "confirmada" : "rejeitada",
      motivoDecisao: motivo.trim() || null,
      decididoPor: quem,
    },
  };
}

// -- Pagamento (fluxo 6, usado no fluxo 10) -----------------------------------------------------------

/** Coeficientes de exemplo do documento: percentagem da hora. */
export interface RegrasPagamentoHE {
  primeiraHoraPct: number;
  seguintesPct: number;
  nocturnoPct: number;
  feriadoPct: number;
  descansoPct: number;
}

export const REGRAS_PAGAMENTO_OMISSAO: RegrasPagamentoHE = {
  primeiraHoraPct: 125,
  seguintesPct: 150,
  nocturnoPct: 25,
  feriadoPct: 200,
  descansoPct: 150,
};

export type CodigoPagamentoHE = "primeira_hora" | "seguintes" | "nocturno" | "feriado" | "descanso";

export interface LinhaPagamentoHE {
  codigo: CodigoPagamentoHE;
  minutos: number;
  pct: number;
  /** Valor exacto (sem arredondar): quem fecha a conta arredonda linha a linha. */
  valor: number;
}

const horas = (min: number): number => min / 60;

/** Só as CONFIRMADAS pagam; as outras são ignoradas aqui. Sem valor da hora não há valor. */
export function pagamentoHorasExtra(
  confirmadas: readonly HoraExtra[],
  valorHora: number | null,
  regras: RegrasPagamentoHE = REGRAS_PAGAMENTO_OMISSAO,
): LinhaPagamentoHE[] {
  const validas = confirmadas.filter((h) => h.estado === "confirmada");
  const vh = valorHora ?? 0;
  const normais = validas.filter((h) => h.origem === "diaria" || h.origem === "semanal" || h.origem === "banco");
  // Cada registo (um dia) tem a sua primeira hora e as horas seguintes.
  const primeira = normais.reduce((s, h) => s + Math.min(60, h.minutos), 0);
  const seguintes = normais.reduce((s, h) => s + Math.max(0, h.minutos - 60), 0);
  const soma = (origem: OrigemHoraExtra): number => validas.filter((h) => h.origem === origem).reduce((s, h) => s + h.minutos, 0);
  const nocturno = validas.reduce((s, h) => s + h.nocturnoMin, 0);
  const candidatas: Array<[CodigoPagamentoHE, number, number]> = [
    ["primeira_hora", primeira, regras.primeiraHoraPct],
    ["seguintes", seguintes, regras.seguintesPct],
    ["nocturno", nocturno, regras.nocturnoPct],
    ["feriado", soma("feriado"), regras.feriadoPct],
    ["descanso", soma("descanso"), regras.descansoPct],
  ];
  return candidatas
    .filter(([, minutos]) => minutos > 0)
    .map(([codigo, minutos, pct]) => ({ codigo, minutos, pct, valor: horas(minutos) * vh * (pct / 100) }));
}
