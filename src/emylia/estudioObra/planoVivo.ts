// 11/11/2026 (Rúben: «o Estúdio da obra todo completo e super dinâmico… alertas dentro, atrasos, adiantamentos, imprevistos»). O plano vivo
// da obra em curso, sem React (o Estúdio da obra desenha; o motor aplica com A.replanearObra):
// · estadoVivo: o que cada tarefa é hoje (validada, por validar, a corrigir, parada, atrasada, em curso, por começar);
// · replanear: o plano posto em dia com um clique. O que já passou fica; o que está atrasado conta com hoje (e empurra o que vem
//   depois); o que ainda não começou anda para trás (adiantar, quando há folga) ou para a frente (atrasos, técnico noutra obra ou de
//   férias). A ordem do plano mantém-se: uma tarefa não começa antes de acabar a que vinha antes dela (com a mesma sobreposição de meio
//   dia que o orçamento já tinha);
// · conflitosNovos: as outras obras onde os mesmos técnicos passam a estar nos mesmos dias (o impacto de um atraso fora desta obra);
// · fimPrevisto / derrapagem: a data de fim face ao plano que veio do orçamento.
import type { Estado, Negocio, Plano, Tarefa } from "../motor";
import { estadoDe } from "../obraOps";
import { enviosDe } from "../trabalhoObra";
import { fimDe } from "../ajustesPlano";
import { motivoOcupado } from "../preparacaoObra";
import { deIso, diasDaObra, isoDia } from "../planoObra";
import { equipaDe } from "../equipa/equipasObra";

export type EstadoVivo = "validada" | "feita" | "corrigir" | "parada" | "atrasada" | "em curso" | "hoje" | "por começar";
export const ROTULO_VIVO: Record<EstadoVivo, string> = {
  validada: "Validada", feita: "Feita, por validar", corrigir: "A corrigir", parada: "Parada", atrasada: "Atrasada",
  "em curso": "Em curso", hoje: "Começa hoje", "por começar": "Por começar",
};

/** O que a tarefa é hoje, no plano vivo. */
export function estadoVivo(t: Tarefa, p: Plano): EstadoVivo {
  const e = estadoDe(t);
  if (p.estado === "concluída" || e === "validada") return "validada";
  if (e === "feita") return "feita";
  if (t.bloqueio) return "parada";
  if (e === "corrigir") return "corrigir";
  if (p.estado !== "em curso") return "por começar";
  if (t.dia + t.dur <= p.dia) return "atrasada";
  if (t.dia <= p.dia) return e === "em curso" || enviosDe(t).length ? "em curso" : "hoje";
  return "por começar";
}

/** Já há trabalho na tarefa (o técnico começou, registou ou deu-a por feita). */
export const comecada = (t: Tarefa): boolean => estadoDe(t) !== "por fazer" || enviosDe(t).length > 0;

/** O rótulo do estado, com o caso da que devia ter começado e ainda não tem registo. */
export const rotuloVivo = (t: Tarefa, p: Plano): string => {
  const v = estadoVivo(t, p);
  return v === "hoje" && t.dia < p.dia ? "Devia ter começado" : ROTULO_VIVO[v];
};

/** Os dias úteis de atraso de uma tarefa que já devia ter acabado (0 se não está atrasada). */
export function diasDeAtraso(t: Tarefa, p: Plano): number {
  return estadoVivo(t, p) === "atrasada" ? p.dia - (t.dia + t.dur) + 1 : 0;
}

/** Acabada (feita ou validada): o dia em que acabou de facto (exclusivo), pelo último registo; sem registos, o do plano. */
export function fimFeito(t: Tarefa): number {
  const planeado = t.dia + t.dur;
  // o dia em que o técnico a deu por feita (a validação pode vir depois); sem ele, o da validação (dada por feita pelo responsável)
  const E = enviosDe(t), feitas = E.filter((e) => e.k === "feita");
  const ult = (feitas.length ? feitas : E.filter((e) => e.k === "validada")).reduce((a, e) => Math.max(a, e.dia), -1);
  return ult >= t.dia ? Math.min(planeado, ult + 1) : planeado;
}

/** A parte feita de uma tarefa, de 0 a 1 (para encher a barra): as horas registadas sobre as previstas, ou os dias que já passaram. */
export function feitoDe(t: Tarefa, p: Plano): number {
  const v = estadoVivo(t, p);
  if (v === "validada" || v === "feita") return 1;
  if (v === "por começar" || p.estado !== "em curso") return 0;
  const horas = t.exec?.horas ?? 0;
  const pelasHoras = t.h > 0 ? horas / t.h : 0;
  const pelosDias = Math.max(0, Math.min(t.dur, p.dia - t.dia)) / Math.max(1, t.dur);
  return Math.max(0, Math.min(0.95, Math.max(pelasHoras, horas > 0 ? pelosDias * 0.5 : 0)));
}

export interface Mudanca { ti: number; nome: string; de: { dia: number; dur: number }; para: { dia: number; dur: number }; tipo: "adiantada" | "adiada" | "prolongada";
  /** porque anda mais do que a ordem do plano pede: o técnico (noutra obra, de férias, noutra tarefa desta obra) */ espera?: { tec: string; motivo: string } }
export interface Replano { plano: Plano; mudancas: Mudanca[]; fimAntes: number; fimDepois: number }

const copia = (p: Plano): Plano => JSON.parse(JSON.stringify(p));

/**
 * O plano posto em dia (numa cópia; o plano não muda). Com `adiantar`, o que ainda não começou puxa-se para a frente quando há folga
 * (a tarefa anterior acabou mais cedo, ou havia um intervalo); sem ele, só se empurra o que for preciso.
 */
export function replanear(p: Plano, ocup: Map<string, Set<string>>, o: { adiantar: boolean; forcar?: { ti: number; dia: number; dur: number } }): Replano {
  const c = copia(p), hoje = p.estado === "em curso" ? p.dia : -1, amanha = hoje + 1;
  const T = p.tasks, N = T.length;
  const ordem = T.map((_, i) => i).sort((a, b) => T[a].dia - T[b].dia || (T[a].fase ?? 0) - (T[b].fase ?? 0) || a - b);
  const fim: number[] = new Array(N).fill(0);
  const colocadas: number[] = [];
  const espera = new Map<number, { tec: string; motivo: string }>();
  for (const i of ordem) {
    const t = T[i], n = c.tasks[i], v = estadoVivo(t, p), f = o.forcar?.ti === i ? o.forcar : null;
    if (v === "validada" || v === "feita") { fim[i] = fimFeito(t); colocadas.push(i); continue; }
    // já começou: há registo do técnico (11/11, testarh: a que devia ter começado ontem e não tem nada ainda anda, mas não para antes de hoje)
    // parada por um imprevisto: fica onde está até o cliente decidir (o alerta do imprevisto trata dela)
    if (hoje >= 0 && t.bloqueio && t.dia <= hoje) { fim[i] = t.dia + t.dur; colocadas.push(i); continue; }
    if (hoje >= 0 && t.dia <= hoje && comecada(t)) {
      // já começou: fica onde está; atrasada, conta com hoje
      n.dur = Math.max(f?.dur ?? t.dur, hoje - t.dia + 1);
      fim[i] = n.dia + n.dur; colocadas.push(i); continue;
    }
    if (f) n.dur = f.dur;
    // ainda não começou: depois das que vinham antes dela, com o mesmo intervalo (ou sem ele, a adiantar)
    const antes = T.map((x, j) => j).filter((j) => j !== i && T[j].dia < t.dia && T[j].dia + T[j].dur <= t.dia + 1);
    let ini = t.dia;
    if (antes.length) {
      const pelasAnteriores = Math.max(...antes.map((j) => {
        const lag = t.dia - (T[j].dia + T[j].dur);
        return fim[j] + (o.adiantar ? Math.min(0, lag) : lag);
      }));
      ini = o.adiantar && !t.bloqueio ? pelasAnteriores : Math.max(t.dia, pelasAnteriores);
    }
    ini = Math.max(ini, hoje >= 0 && t.dia <= hoje ? hoje : amanha, f?.dia ?? 0);
    // o técnico livre (sem férias, sem outra obra, sem outra tarefa desta obra ao mesmo tempo)
    if (n.tec) {
      const outras = colocadas.map((j) => c.tasks[j]).filter((x) => x.tec === n.tec);
      let k = 0, m: string | null = null, primeiro: string | null = null;
      while (k < 60 && (m = motivoOcupado(n.tec, { ...n, dia: ini }, c, ocup, outras)) != null) { primeiro ??= m; ini++; k++; }
      if (k === 60) ini = Math.max(t.dia, ini - 60);
      else if (primeiro && ini > t.dia) espera.set(i, { tec: n.tec, motivo: primeiro });
    }
    n.dia = ini;
    fim[i] = n.dia + n.dur; colocadas.push(i);
  }
  const mudancas: Mudanca[] = [];
  T.forEach((t, i) => {
    const n = c.tasks[i];
    if (n.dia === t.dia && n.dur === t.dur) return;
    const e = espera.get(i);
    mudancas.push({ ti: i, nome: t.nome, de: { dia: t.dia, dur: t.dur }, para: { dia: n.dia, dur: n.dur }, tipo: n.dur !== t.dur && n.dia === t.dia ? "prolongada" : n.dia < t.dia ? "adiantada" : "adiada", ...(e ? { espera: e } : {}) });
  });
  return { plano: c, mudancas, fimAntes: fimDe(p.tasks), fimDepois: fimDe(c.tasks) };
}

/** Os dias (iso) que cada técnico ocupa num plano (as tarefas por validar; uma equipa ocupa todos os membros). */
function ocupacaoDe(p: Plano): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  if (!p.inicio) return out;
  const ds = diasDaObra(deIso(p.inicio), Math.max(1, fimDe(p.tasks)));
  for (const t of p.tasks) {
    if (!t.tec || estadoDe(t) === "validada") continue;
    for (const id of equipaDe(t.tec)?.membros ?? [t.tec]) {
      const s = out.get(id) ?? new Set<string>();
      for (let k = t.dia; k < t.dia + t.dur && k < ds.length; k++) s.add(isoDia(ds[k]));
      out.set(id, s);
    }
  }
  return out;
}

export interface ConflitoFora { tec: string; obra: Negocio; dias: string[] }
/**
 * O impacto de um plano novo nas outras obras: onde os técnicos desta obra passam a estar ao mesmo tempo noutra obra (só o que é novo
 * face ao plano de agora), por técnico e por obra, com os dias.
 */
export function conflitosNovos(S: Pick<Estado, "deals">, d: Negocio, novo: Plano): ConflitoFora[] {
  const agora = d.obra.plano ? ocupacaoDe(d.obra.plano) : new Map<string, Set<string>>(), depois = ocupacaoDe(novo);
  const out: ConflitoFora[] = [];
  for (const o of S.deals ?? []) {
    const q = o.obra?.plano;
    if (o.id === d.id || o.perdido || !q || q.estado === "concluída" || !q.inicio) continue;
    const delas = ocupacaoDe(q);
    for (const [tec, dias] of depois) {
      const fora = delas.get(tec);
      if (!fora) continue;
      const antes = agora.get(tec) ?? new Set<string>();
      const novos = [...dias].filter((x) => fora.has(x) && !antes.has(x)).sort();
      if (novos.length) out.push({ tec, obra: o, dias: novos });
    }
  }
  return out;
}

/** Os dias úteis a mais (ou a menos, negativo) do fim da obra face ao plano que veio do orçamento (sem base: 0). */
export function derrapagem(p: Plano): number {
  if (!p.base?.length) return 0;
  return fimDe(p.tasks) - fimDe(p.base.map((b, i) => ({ dia: b.dia, dur: b.dur, i })).filter((_, i) => !p.tasks[i]?.corrige && !p.tasks[i]?.adenda && !p.tasks[i]?.problema));
}

/** A data (Date) de um índice de dia do plano; sem início, null. */
export function dataDoDia(p: Plano, k: number): Date | null {
  if (!p.inicio) return null;
  return diasDaObra(deIso(p.inicio), Math.max(1, k + 1))[k] ?? null;
}

/** Um atraso simulado numa tarefa (numa cópia): a que já começou fica mais longa, a que não começou começa mais tarde; o que vem depois
 *  anda pela ordem do plano (sem adiantar nada). */
export function simularAtraso(p: Plano, ti: number, dias: number, ocup: Map<string, Set<string>>): Replano {
  const t = p.tasks[ti];
  if (!t || !dias) return { plano: copia(p), mudancas: [], fimAntes: fimDe(p.tasks), fimDepois: fimDe(p.tasks) };
  const comecou = p.estado === "em curso" && t.dia <= p.dia && comecada(t);
  const forcar = comecou ? { ti, dia: t.dia, dur: Math.max(1, Math.max(t.dur, p.dia - t.dia + 1) + dias) } : { ti, dia: t.dia + dias, dur: t.dur };
  return replanear(p, ocup, { adiantar: false, forcar });
}

/** O que mudou de um plano para uma cópia mexida (ex.: o atraso de um imprevisto, imprevistos.ts: atrasar), como um Replano. */
export function replanoDe(p: Plano, c: Plano): Replano {
  const mudancas: Mudanca[] = [];
  p.tasks.forEach((t, i) => {
    const n = c.tasks[i];
    if (!n || (n.dia === t.dia && n.dur === t.dur)) return;
    mudancas.push({ ti: i, nome: t.nome, de: { dia: t.dia, dur: t.dur }, para: { dia: n.dia, dur: n.dur }, tipo: n.dur !== t.dur && n.dia === t.dia ? "prolongada" : n.dia < t.dia ? "adiantada" : "adiada" });
  });
  return { plano: c, mudancas, fimAntes: fimDe(p.tasks), fimDepois: fimDe(c.tasks) };
}
