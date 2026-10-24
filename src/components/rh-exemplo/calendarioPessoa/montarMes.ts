/**
 * O mes de uma pessoa, dia a dia: junta o previsto (horario em vigor, excepcao, feriado, ausencia) ao feito
 * (horas realizadas e picagens), as faltas, as horas extra e o banco de horas. Funcao pura: recebe as linhas
 * ja lidas dos stores e devolve um `DiaCalendario` por dia, do dia 1 ao ultimo.
 */
import type { MovimentoBanco } from "@/components/rh-exemplo/fluxosC/bancoHorasRegras";
import type { HoraExtra } from "@/components/rh-exemplo/fluxosC/horasExtraRegras";
import type { HorarioPessoa } from "@/components/rh-exemplo/lib/horarioTipos";
import type { HorarioRealizado } from "@/components/rh-exemplo/tipos";
import type { Falta, Picagem } from "@/components/rh-exemplo/tiposAssiduidade";
import { diferencaDoDia, type ChipDia, type IntervaloFeito } from "./diferenca";
import { resolverPrevistoDoDia, type AusenciaDoDiaCal, type ContextoPrevisto, type PrevistoDoDia } from "./previsto";

export interface EntradaMes {
  ano: number;
  /** 1 a 12. */
  mes: number;
  hoje: string;
  horario: HorarioPessoa | undefined;
  contrato: { desde: string; ate: string | null } | null;
  ausencias: ReadonlyMap<string, AusenciaDoDiaCal>;
  /** Linhas ja EM VIGOR (sem corrigidas nem rejeitadas), de qualquer data. */
  realizado: readonly HorarioRealizado[];
  picagens: readonly Picagem[];
  faltas: readonly Falta[];
  horasExtra: readonly HoraExtra[];
  banco: readonly MovimentoBanco[];
  podeHE: boolean;
  /** Dias em que uma picagem foi a mais de 200 m do local. */
  diasForaDoLocal: ReadonlySet<string>;
}

export interface PicagemDoDia {
  id: string;
  sentido: "entrada" | "saida";
  hora: string;
}

export interface SemanaLivre {
  feitoMin: number;
  alvoMin: number;
  /** Segunda-feira a domingo, em ISO. */
  de: string;
  ate: string;
}

export interface DiaCalendario {
  data: string;
  diaSemana: number;
  previsto: PrevistoDoDia;
  feitos: IntervaloFeito[];
  picagens: PicagemDoDia[];
  feitoMin: number;
  deltaMin: number | null;
  atrasoMin: number;
  chips: ChipDia[];
  faltas: Falta[];
  horasExtra: HoraExtra[];
  banco: MovimentoBanco[];
  passado: boolean;
  hoje: boolean;
  semana: SemanaLivre | null;
}

function somarDias(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}

export function diasDoMes(ano: number, mes: number): string[] {
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return Array.from({ length: ultimo }, (_, i) => `${ano}-${String(mes).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
}

function agrupar<T>(linhas: readonly T[], chave: (l: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const l of linhas) mapa.set(chave(l), [...(mapa.get(chave(l)) ?? []), l]);
  return mapa;
}

function semanaDe(data: string, ctx: ContextoPrevisto, realizado: ReadonlyMap<string, HorarioRealizado[]>): SemanaLivre {
  const dow = new Date(`${data}T00:00:00Z`).getUTCDay();
  const de = somarDias(data, dow === 0 ? -6 : 1 - dow);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(de, i));
  const alvoMin = dias.reduce((s, d) => s + resolverPrevistoDoDia(ctx, d).minutosParaTotais, 0);
  const feitoMin = dias.reduce((s, d) => s + (realizado.get(d) ?? []).reduce((x, l) => x + l.minutos, 0), 0);
  return { feitoMin, alvoMin, de, ate: dias[6] };
}

export function montarMes(e: EntradaMes): DiaCalendario[] {
  const ctx: ContextoPrevisto = { horario: e.horario, contrato: e.contrato, ausencias: e.ausencias };
  const porRealizado = agrupar(e.realizado, (l) => l.data);
  const porPicagem = agrupar(e.picagens, (p) => p.data_local);
  const porFalta = agrupar(e.faltas, (f) => f.data);
  const porHE = agrupar(e.horasExtra, (h) => h.data);
  const porBanco = agrupar(e.banco, (m) => m.data);

  return diasDoMes(e.ano, e.mes).map((data) => {
    const previsto = resolverPrevistoDoDia(ctx, data);
    const feitos = (porRealizado.get(data) ?? [])
      .map((l) => ({ inicio: l.hora_inicio.slice(0, 5), fim: l.hora_fim.slice(0, 5) }))
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
    const faltas = porFalta.get(data) ?? [];
    const horasExtra = porHE.get(data) ?? [];
    const banco = porBanco.get(data) ?? [];
    const passado = data < e.hoje;
    const d = diferencaDoDia({ previsto, feitos, faltas, horasExtra, banco, podeHE: e.podeHE, foraDoLocal: e.diasForaDoLocal.has(data), passado });
    return {
      data, diaSemana: new Date(`${data}T00:00:00Z`).getUTCDay(), previsto, feitos,
      picagens: (porPicagem.get(data) ?? []).map((p) => ({ id: p.id, sentido: p.sentido, hora: p.hora_local.slice(0, 5) })),
      feitoMin: d.feitoMin, deltaMin: d.deltaMin, atrasoMin: d.atrasoMin, chips: d.chips, faltas, horasExtra, banco,
      passado, hoje: data === e.hoje,
      semana: previsto.tipo === "livre" ? semanaDe(data, ctx, porRealizado) : null,
    };
  });
}
