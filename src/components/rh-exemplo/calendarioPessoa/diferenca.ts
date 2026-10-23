/**
 * A DIFERENCA de um dia: o que foi feito contra o que estava previsto, e o que isso significa (atraso, falta
 * marcada ou sugerida, tempo a mais, hora extra, banco de horas). Funcoes puras, sem store nem ecra.
 *
 * Regras (as mesmas do fluxo 4, 5, 6 e 7 do documento):
 *  - um atraso so conta acima da tolerancia (5 min por omissao);
 *  - o que falta e nao tem falta marcada e uma falta SUGERIDA (so em dias ja passados);
 *  - o tempo a mais so vira hora extra com a marca «pode fazer horas extra» e com o minimo de 15 min;
 *  - no banco de horas o tempo a mais e um credito e o que falta um debito, nunca falta nem hora extra;
 *  - no horario livre as contas sao por semana (nao ha diferenca por dia); na isencao nao ha horas extra.
 */
import { rotuloDaJustificacao, type RotuloJustificacao } from "@/components/rh-exemplo/lib/faltasB";
import { TOLERANCIA_ATRASO_MINUTOS, minutosDeHora } from "@/components/rh-exemplo/lib/horarioTipos";
import type { MovimentoBanco } from "@/components/rh-exemplo/fluxosC/bancoHorasRegras";
import { MINIMO_HORA_EXTRA_MIN, estadoVisivel, type EstadoVisivelHE, type HoraExtra, type OrigemHoraExtra } from "@/components/rh-exemplo/fluxosC/horasExtraRegras";
import type { Falta } from "@/components/rh-exemplo/tiposAssiduidade";
import { periodosDoPrevisto, type PeriodoMin, type PrevistoDoDia } from "./previsto";

export type ChipTipo =
  | "atraso" | "falta_marcada" | "falta_sugerida" | "extra" | "tempo_a_mais"
  | "banco_credito" | "banco_debito" | "fora_local" | "trabalho_em_folga";

export type MotivoSemHoraExtra = "sem_marca" | "abaixo_minimo" | "por_registar";

export interface ChipDia {
  tipo: ChipTipo;
  minutos: number;
  estado?: EstadoVisivelHE;
  acima?: boolean;
  origem?: OrigemHoraExtra;
  motivo?: MotivoSemHoraExtra;
  justificacao?: RotuloJustificacao;
  refId?: string;
}

export interface IntervaloFeito {
  inicio: string;
  fim: string;
}

export interface ArgsDiferenca {
  previsto: PrevistoDoDia;
  feitos: readonly IntervaloFeito[];
  faltas: readonly Falta[];
  horasExtra: readonly HoraExtra[];
  banco: readonly MovimentoBanco[];
  podeHE: boolean;
  foraDoLocal: boolean;
  /** O dia ja acabou: so ai se julga o que faltou e o que sobrou. */
  passado: boolean;
  tolerancia?: number;
}

export interface DiferencaDoDia {
  feitoMin: number;
  /** feito − previsto; `null` quando nao ha horas fixas, o dia nao acabou ou nao era de trabalho. */
  deltaMin: number | null;
  atrasoMin: number;
  chips: ChipDia[];
}

export function minutosFeitos(feitos: readonly IntervaloFeito[]): number {
  return feitos.reduce((s, f) => s + Math.max(0, (minutosDeHora(f.fim) ?? 0) - (minutosDeHora(f.inicio) ?? 0)), 0);
}

/** O atraso da primeira entrada face ao periodo previsto em que cai. */
export function atrasoDoDia(periodos: readonly PeriodoMin[], feitos: readonly IntervaloFeito[]): number {
  const primeira = feitos[0];
  if (!primeira) return 0;
  const ini = minutosDeHora(primeira.inicio) ?? 0;
  const fim = minutosDeHora(primeira.fim) ?? 0;
  const periodo = periodos.find((p) => Math.min(p.fim, fim) - Math.max(p.ini, ini) > 0);
  return periodo ? Math.max(0, ini - periodo.ini) : 0;
}

function chipsDeRegistos(a: ArgsDiferenca): ChipDia[] {
  const faltas = a.faltas.map((f): ChipDia => ({ tipo: "falta_marcada", minutos: f.minutos, justificacao: rotuloDaJustificacao(f), refId: f.id }));
  const extras = a.horasExtra.map((h): ChipDia => ({ tipo: "extra", minutos: h.minutos, estado: estadoVisivel(h), acima: h.acimaDoLimite, origem: h.origem, refId: h.id }));
  const banco = a.banco.map((m): ChipDia => ({ tipo: m.minutos >= 0 ? "banco_credito" : "banco_debito", minutos: Math.abs(m.minutos), refId: m.id }));
  return [...faltas, ...extras, ...banco];
}

function motivoSemHoraExtra(delta: number, podeHE: boolean): MotivoSemHoraExtra {
  if (!podeHE) return "sem_marca";
  return delta < MINIMO_HORA_EXTRA_MIN ? "abaixo_minimo" : "por_registar";
}

function chipsDeDesvio(a: ArgsDiferenca, delta: number, tol: number): ChipDia[] {
  const tipo = a.previsto.tipo;
  if (tipo === "banco") return [];
  if (delta < 0) {
    const marcadas = a.faltas.reduce((s, f) => s + f.minutos, 0);
    const porMarcar = -delta - marcadas;
    return porMarcar > tol ? [{ tipo: "falta_sugerida", minutos: porMarcar }] : [];
  }
  if (delta > tol && a.horasExtra.length === 0) {
    return [{ tipo: "tempo_a_mais", minutos: delta, motivo: motivoSemHoraExtra(delta, a.podeHE) }];
  }
  return [];
}

export function diferencaDoDia(a: ArgsDiferenca): DiferencaDoDia {
  const tol = a.tolerancia ?? TOLERANCIA_ATRASO_MINUTOS;
  const feitoMin = minutosFeitos(a.feitos);
  const avaliavel = a.passado && a.previsto.kind === "trabalha" && !a.previsto.semHorasFixas;
  const deltaMin = avaliavel ? feitoMin - a.previsto.minutos : null;
  const atrasoMin = a.passado ? atrasoDoDia(periodosDoPrevisto(a.previsto), a.feitos) : 0;
  const chips: ChipDia[] = [];
  if (atrasoMin > tol) chips.push({ tipo: "atraso", minutos: atrasoMin });
  chips.push(...chipsDeRegistos(a));
  if (deltaMin !== null) chips.push(...chipsDeDesvio(a, deltaMin, tol));
  const folga = a.previsto.kind === "feriado" || a.previsto.kind === "nao_trabalha";
  if (folga && feitoMin > 0) chips.push({ tipo: "trabalho_em_folga", minutos: feitoMin });
  if (a.foraDoLocal) chips.push({ tipo: "fora_local", minutos: 0 });
  return { feitoMin, deltaMin, atrasoMin, chips };
}
