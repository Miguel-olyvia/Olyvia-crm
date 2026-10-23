// A Agenda nas Definições da V2 (13/10/2026): os Quadros, os Recursos e as Regras de marcação que no
// antigo viviam em separadores do /scheduling (Scheduling.tsx: Quadros, Recursos, Regras e o
// ScheduleSettingsDialog). Tipos, opções e regras puras; os dados vivem na store (definicoesDados.ts).
import type { Papel } from "../motor";

export const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;
export const DIAS_NOME = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"] as const;

/** As cores de um quadro (só se veem no ícone). Nome para o leitor de ecrã e classe do ícone. */
export const CORES_QUADRO: Record<string, string> = {
  Azul: "text-sky-600",
  Verde: "text-emerald-600",
  Laranja: "text-orange-600",
  Roxo: "text-violet-600",
  Cinzento: "text-slate-500",
};

export type QuemVe = "todos" | Papel;
export const OPCOES_QUEM_VE: { id: QuemVe; nome: string }[] = [
  { id: "todos", nome: "Toda a equipa" },
  { id: "comercial", nome: "Comercial" },
  { id: "operacoes", nome: "Operações" },
  { id: "direcao", nome: "Só a Direção" },
];

export interface Quadro { id: string; nome: string; cor: string; quemVe: QuemVe }

export type TipoRecurso = "Pessoa" | "Veículo" | "Equipamento";
export const TIPOS_RECURSO: TipoRecurso[] = ["Pessoa", "Veículo", "Equipamento"];

/** Um recurso marcável; `dias` são os 7 dias da semana (segunda primeiro), true = disponível. */
export interface Recurso { id: string; nome: string; tipo: TipoRecurso; dias: boolean[] }

export interface DuracaoVisita { tipo: string; minutos: number }

export interface RegrasMarcacao {
  duracoes: DuracaoVisita[];
  intervaloMin: number;
  antecedencia: string;
  inicio: string;
  fim: string;
  diasTrabalho: boolean[];
}

export const OPCOES_ANTECEDENCIA = ["Sem mínimo", "2 horas", "1 dia", "2 dias"];
/** As horas que se escolhem no horário (das 6:00 às 22:00, de meia em meia hora). */
export const HORAS: string[] = Array.from({ length: 33 }, (_, i) => `${String(6 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

const SEMANA = [true, true, true, true, true, false, false];

export function agendaInicial(): { quadros: Quadro[]; recursos: Recurso[]; regras: RegrasMarcacao } {
  return {
    quadros: [
      { id: "q1", nome: "Visitas comerciais", cor: "Azul", quemVe: "todos" },
      { id: "q2", nome: "Obras", cor: "Laranja", quemVe: "operacoes" },
      { id: "q3", nome: "Entregas e recolhas", cor: "Verde", quemVe: "todos" },
    ],
    recursos: [
      { id: "r1", nome: "Rúben", tipo: "Pessoa", dias: [...SEMANA] },
      { id: "r2", nome: "Filipe", tipo: "Pessoa", dias: [true, true, true, true, true, true, false] },
      { id: "r3", nome: "Carrinha Renault Master", tipo: "Veículo", dias: [...SEMANA] },
      { id: "r4", nome: "Rebarbadora de parede", tipo: "Equipamento", dias: [true, false, true, false, true, false, false] },
    ],
    regras: {
      duracoes: [
        { tipo: "Visita de levantamento", minutos: 60 },
        { tipo: "Medição final", minutos: 45 },
        { tipo: "Entrega da proposta", minutos: 30 },
      ],
      intervaloMin: 30,
      antecedencia: "1 dia",
      inicio: "09:00",
      fim: "18:00",
      diasTrabalho: [...SEMANA],
    },
  };
}

/** "Seg a Sex", "Seg, Qua, Sex", "Todos os dias" ou "Nenhum dia". */
export function resumoDias(dias: readonly boolean[]): string {
  const on = dias.map((d, i) => (d ? i : -1)).filter((i) => i >= 0);
  if (!on.length) return "Nenhum dia";
  if (on.length === 7) return "Todos os dias";
  const seguidos = on.every((d, k) => k === 0 || d === on[k - 1] + 1);
  if (seguidos && on.length >= 3) return `${DIAS[on[0]]} a ${DIAS[on[on.length - 1]]}`;
  return on.map((i) => DIAS[i]).join(", ");
}

/** O horário de trabalho só se aceita com o fim depois do início: escolher um ajusta o outro. */
export function acertarHorario(inicio: string, fim: string, mudou: "inicio" | "fim"): { inicio: string; fim: string } {
  if (fim > inicio) return { inicio, fim };
  const i = HORAS.indexOf(mudou === "inicio" ? inicio : fim);
  if (mudou === "inicio") return { inicio, fim: HORAS[Math.min(HORAS.length - 1, i + 1)] };
  return { inicio: HORAS[Math.max(0, i - 1)], fim };
}

/** "1 h 30 min", "45 min", "2 h". */
export function duracao(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
