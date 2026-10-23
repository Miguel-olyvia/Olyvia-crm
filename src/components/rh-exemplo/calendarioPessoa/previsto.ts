/**
 * O que a pessoa TINHA para fazer num dia: resolve o horario em vigor (tipo e versao), a excepcao de um dia,
 * o contrato, os feriados e as ausencias aprovadas. Funcao pura, sem store nem ecra.
 *
 * Ordem de decisao: sem contrato > feriado > o horario diz que nao trabalha > ausencia aprovada de dia inteiro >
 * dia de trabalho. Uma ausencia de meio dia deixa o dia como de trabalho, com metade das horas.
 */
import {
  minutosDeHora,
  minutosDoDiaPadrao,
  resolverHorarioDoDia,
  versaoEmVigor,
  type ConfigHorario,
  type DiaPadrao,
  type HorarioPessoa,
  type TipoHorario,
} from "@/components/rh-exemplo/lib/horarioTipos";
import { feriadoDe } from "./feriados";

export type KindPrevisto = "trabalha" | "nao_trabalha" | "feriado" | "ausencia" | "sem_contrato" | "sem_horario";

export interface IntervaloPrevisto {
  inicio: string;
  fim: string;
}

export interface AusenciaDoDiaCal {
  nome: string;
  fraccao: number;
}

export interface ContextoPrevisto {
  horario: HorarioPessoa | undefined;
  contrato: { desde: string; ate: string | null } | null;
  ausencias: ReadonlyMap<string, AusenciaDoDiaCal>;
}

export interface PrevistoDoDia {
  kind: KindPrevisto;
  tipo: TipoHorario | null;
  /** Intervalos de calendario do horario (um por periodo; vazio em isencao e livre). */
  intervalos: IntervaloPrevisto[];
  /** Minutos de trabalho previstos nesse dia (0 em feriado, ausencia, folga e horario livre). */
  minutos: number;
  /** O que o horario previa antes de feriado e ausencia: e a base das horas planeadas do mes. */
  minutosHorario: number;
  /** Minutos para somar em totais: no horario livre reparte o total da semana pelos dias de trabalho. */
  minutosParaTotais: number;
  pausaMin: number;
  porExcecao: boolean;
  feriado: string | null;
  ausencia: AusenciaDoDiaCal | null;
  /** Horario livre ou isencao: nao ha horas fixas por dia. */
  semHorasFixas: boolean;
  horasSemanais: number | null;
}

const VAZIO: PrevistoDoDia = {
  kind: "sem_horario", tipo: null, intervalos: [], minutos: 0, minutosHorario: 0, minutosParaTotais: 0,
  pausaMin: 0, porExcecao: false, feriado: null, ausencia: null, semHorasFixas: false, horasSemanais: null,
};

export function diaSemanaIso(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

interface Parte {
  intervalos: IntervaloPrevisto[];
  minutos: number;
  pausaMin: number;
  semHorasFixas: boolean;
  horasSemanais: number | null;
  trabalha: boolean;
}

const DIA_NAO_TRABALHA: DiaPadrao = { trabalha: false, entrada: "09:00", saida: "18:00", pausaMin: 60 };

function deDiaPadrao(dia: DiaPadrao): Parte {
  const trabalha = dia.trabalha;
  return {
    intervalos: trabalha ? [{ inicio: dia.entrada, fim: dia.saida }] : [],
    minutos: trabalha ? minutosDoDiaPadrao(dia) : 0,
    pausaMin: trabalha ? dia.pausaMin : 0,
    semHorasFixas: false,
    horasSemanais: null,
    trabalha,
  };
}

function duracao(i: IntervaloPrevisto): number {
  return Math.max(0, (minutosDeHora(i.fim) ?? 0) - (minutosDeHora(i.inicio) ?? 0));
}

function parteDoTipo(config: ConfigHorario, dow: number): Parte {
  switch (config.tipo) {
    case "padrao":
    case "banco":
      return deDiaPadrao(config.padrao[dow] ?? DIA_NAO_TRABALHA);
    case "repartido": {
      const r = config.repartido;
      if (!r.dias.includes(dow)) return { ...deDiaPadrao(DIA_NAO_TRABALHA) };
      const intervalos = [{ inicio: r.p1Inicio, fim: r.p1Fim }, { inicio: r.p2Inicio, fim: r.p2Fim }];
      return { intervalos, minutos: intervalos.reduce((s, i) => s + duracao(i), 0), pausaMin: 0, semHorasFixas: false, horasSemanais: null, trabalha: true };
    }
    case "isencao":
    case "livre": {
      const cfg = config.tipo === "isencao" ? config.isencao : config.livre;
      const trabalha = cfg.dias.includes(dow) && cfg.dias.length > 0;
      const rateado = trabalha ? Math.round((cfg.horasSemanais * 60) / cfg.dias.length) : 0;
      return {
        intervalos: [], minutos: config.tipo === "isencao" ? rateado : 0, pausaMin: 0,
        semHorasFixas: true, horasSemanais: cfg.horasSemanais, trabalha,
      };
    }
  }
}

function rateadoLivre(config: ConfigHorario, dow: number): number {
  if (config.tipo !== "livre") return 0;
  const { dias, horasSemanais } = config.livre;
  return dias.includes(dow) && dias.length > 0 ? Math.round((horasSemanais * 60) / dias.length) : 0;
}

export interface PeriodoMin {
  ini: number;
  fim: number;
}

const paraMin = (hora: string): number => minutosDeHora(hora) ?? 0;

/** Os periodos de trabalho do dia, em minutos desde a meia-noite; uma pausa sem hora fica a meio do dia. */
export function periodosDoPrevisto(prev: PrevistoDoDia): PeriodoMin[] {
  const intervalos = prev.intervalos.map((i) => ({ ini: paraMin(i.inicio), fim: paraMin(i.fim) }));
  if (intervalos.length !== 1 || prev.pausaMin <= 0) return intervalos;
  const [u] = intervalos;
  const primeira = Math.floor(prev.minutos / 2);
  return [{ ini: u.ini, fim: u.ini + primeira }, { ini: u.ini + primeira + prev.pausaMin, fim: u.fim }];
}

export function resolverPrevistoDoDia(ctx: ContextoPrevisto, iso: string): PrevistoDoDia {
  if (ctx.contrato && (iso < ctx.contrato.desde || (ctx.contrato.ate !== null && iso > ctx.contrato.ate))) {
    return { ...VAZIO, kind: "sem_contrato" };
  }
  return resolverComContrato(ctx, iso);
}

function resolverComContrato(ctx: ContextoPrevisto, iso: string): PrevistoDoDia {
  const horario = ctx.horario;
  const versao = horario ? versaoEmVigor(horario, iso) : null;
  const feriado = feriadoDe(iso);
  if (!horario || !versao) return { ...VAZIO, kind: feriado ? "feriado" : "sem_horario", feriado };

  const resolvido = resolverHorarioDoDia(horario, iso);
  const excecao = resolvido.excecaoId ? (horario.excecoes.find((e) => e.id === resolvido.excecaoId) ?? null) : null;
  const dow = diaSemanaIso(iso);
  const parte: Parte = excecao ? deDiaPadrao(excecao.dia) : parteDoTipo(versao.config, dow);
  const paraTotais = excecao || versao.config.tipo !== "livre" ? parte.minutos : rateadoLivre(versao.config, dow);
  const comum = {
    tipo: versao.config.tipo, pausaMin: parte.pausaMin, porExcecao: Boolean(excecao), feriado,
    semHorasFixas: parte.semHorasFixas, horasSemanais: parte.horasSemanais,
  };
  const folga = { intervalos: [] as IntervaloPrevisto[], minutos: 0, minutosParaTotais: 0, ausencia: null };

  if (feriado) return { ...comum, ...folga, kind: "feriado", minutosHorario: parte.trabalha ? paraTotais : 0 };
  if (!parte.trabalha) return { ...comum, ...folga, kind: "nao_trabalha", minutosHorario: 0 };
  const ausencia = ctx.ausencias.get(iso) ?? null;
  if (ausencia && ausencia.fraccao >= 1) return { ...comum, ...folga, kind: "ausencia", minutosHorario: paraTotais, ausencia };
  const resto = ausencia ? 1 - ausencia.fraccao : 1;
  return {
    ...comum, kind: "trabalha", intervalos: parte.intervalos, minutos: Math.round(parte.minutos * resto),
    minutosHorario: paraTotais, minutosParaTotais: Math.round(paraTotais * resto), ausencia,
  };
}
