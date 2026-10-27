// Operações da V2 (13/10/2026): as regras, sem React. O plano e o estado da obra vêm do motor (d.obra.plano);
// o que o supervisor faz por cima (validar, rejeitar, atrasos, a aprovação com supervisor e data) vive num registo por obra
// (RegObra), guardado em memória por estadoV2.ts. Estas funções não mexem no registo: devolvem um novo.
import { DIAS, conflitos, partes, r2, type Estado, type Negocio, type Plano, type Tarefa } from "../motor";
import type { FatoresReal } from "./realExemplo";

export interface Atraso {
  id: string;
  /** O índice da tarefa no plano. */
  tarefa: number;
  dias: number;
  motivo: string;
  clienteAvisado: boolean;
  /** Dado de exemplo da demonstração (não registado por ninguém). */
  exemplo?: boolean;
}
export interface Aprovacao { supervisor: string; inicio: string }
export interface RegObra {
  validadas: number[];
  /** Tarefa rejeitada → o motivo, que volta ao técnico. */
  rejeitadas: Record<number, string>;
  atrasos: Atraso[];
  aprovacao: Partial<Aprovacao>;
  /** As horas reais dos equipamentos confirmadas no fecho de cada tarefa ("tarefa:equipamento" → horas; equipamentosObra.ts). */
  horasEquip?: Record<string, number>;
}

export const regVazio = (): RegObra => ({ validadas: [], rejeitadas: {}, atrasos: [], aprovacao: {}, horasEquip: {} });

export const SUPERVISORES = ["Filipe", "Hugo"];
export const MOTIVOS_ATRASO = ["Material em falta", "Técnico doente", "O cliente pediu", "Imprevisto na obra", "Chuva"];
export const MOTIVOS_REJEICAO = ["Mal acabada", "Incompleta", "Falta limpar", "Faltam fotografias"];
export const DIAS_ATRASO = [1, 2, 3, 5];

/** "seg 13/10" → "2026-10-13". */
export function isoDia(rotulo: string): string {
  const m = /(\d{1,2})\/(\d{1,2})/.exec(rotulo);
  return m ? `2026-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}
/** Os dias que se podem escolher para o início (os primeiros cinco da agenda do protótipo). */
export const OPCOES_INICIO = DIAS.slice(0, 5).map((r) => ({ rotulo: r, iso: isoDia(r) }));

const dia = (k: number) => DIAS[k] ?? `dia ${k + 1}`;
export function datasTarefa(t: Tarefa): string {
  return t.dur > 1 ? `${dia(t.dia)} a ${dia(t.dia + t.dur - 1)}` : dia(t.dia);
}

/** A tarefa já foi feita pelo técnico (a mesma regra das Operações simples). */
export function feita(p: Plano, i: number): boolean {
  const t = p.tasks[i];
  return !!t && (p.estado === "concluída" || (p.estado === "em curso" && t.dia + t.dur <= p.dia));
}

export type EstadoTarefa = "por fazer" | "por validar" | "validada" | "rejeitada";
export function estadoTarefa(p: Plano, reg: RegObra, i: number): EstadoTarefa {
  if (!feita(p, i)) return "por fazer";
  if (reg.validadas.includes(i)) return "validada";
  if (reg.rejeitadas[i] !== undefined) return "rejeitada";
  return "por validar";
}
export const porValidar = (p: Plano, reg: RegObra): number[] => p.tasks.map((_, i) => i).filter((i) => estadoTarefa(p, reg, i) === "por validar");

export function validarTarefa(reg: RegObra, i: number): RegObra {
  const rejeitadas = { ...reg.rejeitadas };
  delete rejeitadas[i];
  return { ...reg, validadas: reg.validadas.includes(i) ? reg.validadas : [...reg.validadas, i], rejeitadas };
}
/** Valida todas as que estão por validar (as rejeitadas ficam como estão). */
export function validarTodas(p: Plano, reg: RegObra): RegObra {
  return porValidar(p, reg).reduce(validarTarefa, reg);
}
export const erroRejeicao = (motivo: string): string | null => (motivo.trim() ? null : "Escreva ou escolha o motivo: é o que o técnico vai ler.");
export function rejeitarTarefa(reg: RegObra, i: number, motivo: string): RegObra {
  if (erroRejeicao(motivo)) return reg;
  return { ...reg, validadas: reg.validadas.filter((x) => x !== i), rejeitadas: { ...reg.rejeitadas, [i]: motivo.trim() } };
}

export interface NovoAtraso { tarefa: number | null; dias: number; motivo: string; clienteAvisado: boolean }
export function errosAtraso(a: NovoAtraso, p: Plano): string[] {
  const e: string[] = [];
  if (a.tarefa === null || !p.tasks[a.tarefa]) e.push("Escolha a fase que atrasa.");
  if (!(a.dias > 0)) e.push("Escolha quantos dias.");
  if (!a.motivo.trim()) e.push("Escolha o motivo.");
  return e;
}
export function registarAtraso(reg: RegObra, a: NovoAtraso): RegObra {
  const n: Atraso = { id: `a${reg.atrasos.length + 1}`, tarefa: a.tarefa!, dias: a.dias, motivo: a.motivo.trim(), clienteAvisado: a.clienteAvisado };
  return { ...reg, atrasos: [...reg.atrasos, n] };
}
export function avisarCliente(reg: RegObra, id: string, avisado: boolean): RegObra {
  return { ...reg, atrasos: reg.atrasos.map((a) => (a.id === id ? { ...a, clienteAvisado: avisado } : a)) };
}
export const diasAtraso = (reg: RegObra): number => reg.atrasos.reduce((s, a) => s + a.dias, 0);

/** O que falta para aprovar o plano (vazio: pode aprovar-se). */
export function faltaAprovar(p: Plano, reg: RegObra): string[] {
  const f: string[] = [];
  if (!reg.aprovacao.supervisor) f.push("o supervisor");
  if (!reg.aprovacao.inicio) f.push("a data de início");
  const c = conflitos(p).length;
  if (c) f.push(c === 1 ? "resolver o conflito" : `resolver ${c} conflitos`);
  return f;
}

/* ------------------------------------------------------------------ previsto contra real */
export type TipoCusto = "mo" | "eq" | "cons" | "estr";
export const NOME_CUSTO: Record<TipoCusto, string> = { mo: "Mão de obra", eq: "Equipamentos", cons: "Consumíveis", estr: "Estrutura" };

export interface LinhaCusto { k: TipoCusto; nome: string; prev: number; real: number }
export interface PrevistoReal { fracao: number; linhas: LinhaCusto[]; prev: number; real: number }

/** Que parte da obra já foi feita, pelas horas das tarefas feitas. */
export function fracaoFeita(p: Plano): number {
  if (p.estado === "concluída") return 1;
  if (p.estado !== "em curso") return 0;
  const tot = p.tasks.reduce((a, t) => a + t.h, 0);
  return tot > 0 ? p.tasks.reduce((a, t, i) => a + (feita(p, i) ? t.h : 0), 0) / tot : 0;
}

/**
 * O previsto vem da receita (o custo de cada serviço do orçamento, em partes(): mão de obra, equipamentos, consumíveis e estrutura).
 * Numa obra em curso compara-se só a parte já feita. O real é o previsto vezes os fatores de exemplo (realExemplo.ts).
 * `eq` (opcional): os equipamentos contados pelas horas das tarefas feitas (custoEquipamentos, em equipamentosObra.ts), com as horas
 * reais confirmadas no fecho da tarefa; substitui a linha dos equipamentos.
 */
export function previstoReal(d: Negocio, S: Estado, f: FatoresReal, eq?: { prev: number; real: number }): PrevistoReal {
  const p = d.obra.plano;
  if (!p || !d.orc) return { fracao: 0, linhas: [], prev: 0, real: 0 };
  const fr = fracaoFeita(p), P = partes(d, S);
  const ks: TipoCusto[] = ["mo", "eq", "cons", "estr"];
  const linhas = ks.filter((k) => P[k] > 0).map((k) => (k === "eq" && eq
    ? { k, nome: NOME_CUSTO[k], prev: r2(eq.prev), real: r2(eq.real) }
    : { k, nome: NOME_CUSTO[k], prev: r2(P[k] * fr), real: r2(P[k] * fr * f[k]) }))
    .filter((l) => !(eq && l.k === "eq" && l.prev === 0 && l.real === 0));
  return { fracao: fr, linhas, prev: r2(linhas.reduce((a, l) => a + l.prev, 0)), real: r2(linhas.reduce((a, l) => a + l.real, 0)) };
}

export type Sentido = "acima" | "abaixo" | "igual";
/** O desvio do real ao previsto. Até 2% conta como "dentro do previsto". */
export function desvio(prev: number, real: number): { pct: number; dif: number; sentido: Sentido } {
  const dif = r2(real - prev), pct = prev > 0 ? Math.round(((real - prev) / prev) * 100) : 0;
  return { pct, dif, sentido: Math.abs(pct) <= 2 ? "igual" : pct > 0 ? "acima" : "abaixo" };
}

/* ------------------------------------------------------------------ o Hoje do supervisor */
export interface ItemHoje { chave: string; deal: number; titulo: string; texto: string }

/** As tarefas por validar e os atrasos das obras abertas, cada coisa uma só vez. */
export function hojeSupervisor(obras: Negocio[], regDe: (d: Negocio) => RegObra): { validar: ItemHoje[]; atrasos: ItemHoje[] } {
  const validar: ItemHoje[] = [], atrasos: ItemHoje[] = [], vistos = new Set<string>();
  const junta = (lista: ItemHoje[], it: ItemHoje) => { if (!vistos.has(it.chave)) { vistos.add(it.chave); lista.push(it); } };
  for (const d of obras) {
    const p = d.obra.plano;
    if (!p) continue;
    const reg = regDe(d);
    for (const i of porValidar(p, reg)) junta(validar, { chave: `v-${d.id}-${i}`, deal: d.id, titulo: `${p.tasks[i].nome} · ${d.nome}`, texto: `Feita ${datasTarefa(p.tasks[i])}` });
    if (p.estado === "concluída") continue;
    for (const a of reg.atrasos) {
      const t = p.tasks[a.tarefa];
      junta(atrasos, { chave: `a-${d.id}-${a.id}`, deal: d.id, titulo: `${t ? t.nome : "Obra"} · ${d.nome}`,
        texto: `${a.dias} ${a.dias === 1 ? "dia" : "dias"} · ${a.motivo} · ${a.clienteAvisado ? "cliente avisado" : "cliente por avisar"}` });
    }
  }
  return { validar, atrasos };
}
