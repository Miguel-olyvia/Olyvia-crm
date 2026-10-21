// Os ajustes das Operações ao plano da obra (15/10/2026), antes de arrancar: a duração e o início de cada tarefa, em dias
// úteis (os índices do plano já saltam fins de semana e feriados: rotuloDia), pela ordem das fases da obra.
// · O plano guarda uma cópia do que veio do orçamento (base), para mostrar o que mudou e para "Repor o plano do orçamento".
// · Uma tarefa não começa antes do último dia da fase anterior (o orçamento conta meios dias: a passagem de uma fase para a
//   seguinte pode ser a meio do dia); adiar ou alongar uma tarefa empurra as fases seguintes.
// · Mais dias do que o orçamento conta = mais horas de equipa (o custo sobe; o preço ao cliente não muda), como no orçamento.
import { HORAS_DIA } from "./ganttOrcamento";
import type { Plano, Tarefa } from "./motor";

export interface BaseTarefa { dia: number; dur: number; h: number; tec: string | null }

/** O último dia útil ocupado (exclusivo): 4 = o plano ocupa os dias 0 a 3. */
export const fimDe = (tasks: { dia: number; dur: number }[]): number => tasks.reduce((a, t) => Math.max(a, t.dia + t.dur), 0);

/** Guarda o plano do orçamento, uma vez, antes do primeiro ajuste. */
export function guardarBase(p: Plano): void {
  // 21/10: só uma vez; as tarefas de correção juntam-se depois, no fim (a base fica com as do orçamento)
  if (!p.base) p.base = p.tasks.map((t) => ({ dia: t.dia, dur: t.dur, h: t.h, tec: t.tec }));
}

/** O primeiro dia em que uma tarefa da fase `f` pode começar: o último dia das fases anteriores (a passagem pode ser a meio do dia). */
const minimoDaFase = (p: Plano, f: number): number => Math.max(0, fimDe(p.tasks.filter((x) => (x.fase ?? 0) > 0 && (x.fase ?? 0) < f)) - 1);
export function inicioMinimo(p: Plano, ti: number): number {
  const f = p.tasks[ti]?.fase;
  return f ? minimoDaFase(p, f) : 0;
}

/** Pela ordem das fases: nenhuma tarefa começa antes do último dia da fase anterior (empurra para a frente, nunca puxa). */
export function encadearFases(p: Plano): void {
  const fases = [...new Set(p.tasks.map((t) => t.fase ?? 0).filter((f) => f > 0))].sort((a, b) => a - b);
  for (const f of fases) {
    const min = minimoDaFase(p, f);
    for (const t of p.tasks) if (t.fase === f && t.dia < min) t.dia = min;
  }
}

/** As horas de equipa com `dur` dias: mais dias do que o orçamento conta pagam-se (8 h por dia); menos dias não tiram horas. */
export function horasCom(base: BaseTarefa, dur: number): number {
  return dur > base.dur ? dur * HORAS_DIA : base.h;
}

/** Muda a duração (dias úteis inteiros, mínimo 1): o que vinha depois dela anda o mesmo, e as fases encadeiam-se. */
export function mudarDuracao(p: Plano, ti: number, dur: number): void {
  const t = p.tasks[ti];
  if (!t) return;
  guardarBase(p);
  const nd = Math.max(1, Math.round(dur)), delta = nd - t.dur, fimAntes = t.dia + t.dur;
  if (!delta) return;
  t.dur = nd;
  t.h = horasCom(p.base![ti], nd);
  p.tasks.forEach((x, i) => { if (i !== ti && x.dia >= fimAntes) x.dia = Math.max(0, x.dia + delta); });
  encadearFases(p);
}

/** 21/10: a duração em horas úteis (passos de meia hora, mínimo meia hora). Os dias no calendário são os que essas horas
 *  pedem (8 h por dia útil); se mudarem, o que vinha depois anda o mesmo, como em mudarDuracao. As horas são as da tarefa. */
export const diasDasHoras = (h: number): number => Math.max(1, Math.ceil(h / HORAS_DIA - 1e-9));
export function mudarHoras(p: Plano, ti: number, h: number): void {
  const t = p.tasks[ti];
  if (!t) return;
  guardarBase(p);
  const nh = Math.max(0.5, Math.round(h * 2) / 2), nd = diasDasHoras(nh), delta = nd - t.dur, fimAntes = t.dia + t.dur;
  t.h = nh;
  if (!delta) return;
  t.dur = nd;
  p.tasks.forEach((x, i) => { if (i !== ti && x.dia >= fimAntes) x.dia = Math.max(0, x.dia + delta); });
  encadearFases(p);
}

/** Muda o dia de início (não antes do fim da fase anterior); as fases seguintes empurram-se se for preciso. */
export function mudarInicio(p: Plano, ti: number, dia: number): void {
  const t = p.tasks[ti];
  if (!t) return;
  guardarBase(p);
  t.dia = Math.max(inicioMinimo(p, ti), Math.max(0, Math.round(dia)));
  encadearFases(p);
}

/** Volta ao plano do orçamento (datas, dias, horas e técnicos); as notas ficam. */
export function reporBase(p: Plano): boolean {
  if (!p.base || p.base.length > p.tasks.length) return false;
  p.tasks.forEach((t, i) => { const b = p.base![i]; if (!b) return; t.dia = b.dia; t.dur = b.dur; t.h = b.h; t.tec = b.tec; });
  return true;
}

/** O que mudou face ao orçamento: dias úteis no total, horas de equipa e as tarefas mexidas. */
export function diferencas(p: Plano): { dias: number; horas: number; mexidas: number[] } {
  if (!p.base || p.base.length > p.tasks.length) return { dias: 0, horas: 0, mexidas: [] };
  const b = p.base;
  // as tarefas a mais (correções) contam inteiras nas horas e não são "mexidas"
  const mexidas = p.tasks.map((t, i) => (b[i] && (t.dia !== b[i].dia || t.dur !== b[i].dur || t.tec !== b[i].tec) ? i : -1)).filter((i) => i >= 0);
  const horas = p.tasks.reduce((a, t, i) => a + (t.h - (b[i]?.h ?? 0)), 0);
  return { dias: fimDe(p.tasks) - fimDe(b), horas: Math.round(horas * 100) / 100, mexidas };
}

/** A tarefa mexida em relação ao orçamento (para a marcar no ecrã). */
export const mexida = (p: Plano, ti: number): boolean => {
  const b = p.base?.[ti], t: Tarefa | undefined = p.tasks[ti];
  return !!b && !!t && (t.dia !== b.dia || t.dur !== b.dur || t.tec !== b.tec);
};
