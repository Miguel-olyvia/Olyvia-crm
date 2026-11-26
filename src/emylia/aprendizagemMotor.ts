// 26/11 (plano «Obra Viva», etapa 5; Rúben: «a plataforma tem de aprender com tudo, e crescer, ser o máximo autónoma possível»).
// A aprendizagem chega ao motor. As obras todas da empresa ensinam o plano das seguintes:
//  · o que se viu em obra: os dias em que o técnico trabalhou mesmo em cada tarefa (os registos do Hoje) e as horas que registou;
//  · o que o gestor corrigiu ao validar o plano (obra.aprendizagem: o plano gerado contra o aprovado).
// Daqui saem lições por tipo de tarefa (o serviço do Catálogo e o ofício). Com 3 obras ou mais a dizer o mesmo, o plano que o motor gera
// para uma obra nova já nasce com a duração corrigida (só os dias do calendário: as horas e o preço ao cliente não mudam). As horas que o
// Catálogo devia ter mudam o preço: essas ficam como proposta para quem gere o Catálogo. E mede-se o erro do motor obra a obra, para se
// ver se está a melhorar. Sem SQL: tudo se calcula dos negócios carregados, por isso cresce sozinho com cada obra que acaba.
import type { Negocio, Tarefa } from "./motor";
import { geradoDe, type TarefaRetrato } from "./planoAntesDepois";

/** Com quantas obras diferentes a dizer o mesmo uma lição passa a valer sozinha. */
export const MIN_OBRAS = 3;
/** Abaixo deste desvio (15%), o motor já acerta: não se muda nada. */
export const MIN_DESVIO = 0.15;
const LIMITES: [number, number] = [0.5, 2.5];

const r2 = (n: number) => Math.round(n * 100) / 100;
const meioDia = (n: number) => Math.max(0.5, Math.round(n * 2) / 2);

/** A chave de uma lição: o serviço do Catálogo (ou o nome, na demolição e nas tarefas sem serviço) e o ofício. */
export function chaveLicao(svc: string | undefined | null, perfil: string | undefined | null, nome: string): string {
  return `${svc || `n:${nome.trim().toLowerCase()}`}|${perfil ?? ""}`;
}
export const chaveDaTarefa = (t: Pick<Tarefa, "svcs" | "perfilId" | "sk" | "nome">) => chaveLicao(t.svcs?.[0], t.perfilId || t.sk, t.nome);

export type FonteObs = "obra" | "validacao";
/** Uma observação: numa obra, esta tarefa levou `razao` vezes os dias que o motor previu (sem lições). */
export interface Observacao { chave: string; nome: string; obra: number; razao: number; peso: number; fonte: FonteObs }
export interface ObsHoras { chave: string; nome: string; obra: number; previstas: number; reais: number }

export interface Licao {
  chave: string; nome: string;
  /** os dias reais a dividir pelos previstos (a mediana pesada: o que se viu em obra conta o dobro da correção do gestor) */
  razao: number;
  obras: number; observacoes: number;
  /** vale sozinha: obras suficientes e um desvio que importa */
  aplica: boolean;
}
export interface PropostaCatalogo { chave: string; nome: string; razao: number; obras: number; previstas: number; reais: number }
export interface ErroObra { negocio: number; nome: string; inicio: string | null; tarefas: number; erroDias: number; erroHoras: number | null; comLicoes: boolean }
export interface Aprendizagem { licoes: Map<string, Licao>; catalogo: PropostaCatalogo[]; erros: ErroObra[]; observacoes: number }

/** Os dias em que o técnico trabalhou mesmo na tarefa: os dias com registo ou com o «feita» (cada dia conta uma vez). */
export function diasReais(t: Pick<Tarefa, "exec">): number {
  const s = new Set<number>();
  for (const e of t.exec?.envios ?? []) if ((e.k === "registo" || e.k === "feita") && Number.isFinite(e.dia)) s.add(e.dia);
  return s.size;
}
const acabada = (t: Pick<Tarefa, "exec">) => t.exec?.estado === "feita" || t.exec?.estado === "validada";

/** Junta as tarefas de dois planos pelo nome (a 2.ª «Pintura» com a 2.ª «Pintura»). */
function porNome<T extends { nome: string }>(l: T[]): Map<string, T> {
  const m = new Map<string, T>(), vez = new Map<string, number>();
  for (const t of l) { const k = vez.get(t.nome) ?? 0; vez.set(t.nome, k + 1); m.set(`${t.nome}#${k}`, t); }
  return m;
}

/** Os dias que o motor previu para a tarefa sem as lições (para a razão não se medir contra uma previsão já corrigida). */
const diasSemLicao = (t: Pick<Tarefa, "aprendido" | "dias" | "dur">, g?: TarefaRetrato) => Math.max(1, Math.ceil((t.aprendido?.base ?? g?.dur ?? t.dias ?? t.dur) - 1e-9));

/** O que uma obra ensina: uma observação por tarefa acabada (o que se viu) e por tarefa validada pelo gestor (a correção dele). */
export function observacoesDaObra(d: Pick<Negocio, "id" | "obra">): { dias: Observacao[]; horas: ObsHoras[] } {
  const p = d.obra?.plano, dias: Observacao[] = [], horas: ObsHoras[] = [];
  if (!p) return { dias, horas };
  const gerado = geradoDe(p);
  const G = gerado ? porNome(gerado) : null;
  const vez = new Map<string, number>();
  for (const t of p.tasks) {
    if (t.corrige != null || t.nova || t.interna) { vez.set(t.nome, (vez.get(t.nome) ?? 0) + 1); continue; }
    const k = vez.get(t.nome) ?? 0; vez.set(t.nome, k + 1);
    const g = G?.get(`${t.nome}#${k}`);
    if (!g) continue;
    const chave = chaveDaTarefa(t), base = diasSemLicao(t, g);
    if (acabada(t)) {
      const real = diasReais(t);
      if (real > 0) dias.push({ chave, nome: t.nome, obra: d.id, razao: real / base, peso: 2, fonte: "obra" });
      if ((t.h ?? 0) > 0 && (t.exec?.horas ?? 0) > 0) horas.push({ chave, nome: t.nome, obra: d.id, previstas: t.h, reais: t.exec!.horas });
    }
  }
  // a correção do gestor ao validar (a última aprovação): os dias que ele deu a cada tarefa contra os que o motor gerou
  const reg = [...(d.obra?.aprendizagem ?? [])].reverse().find((r) => r.motivo === "aprovado");
  if (reg) {
    const A = porNome(reg.gerado), B = porNome(reg.final), T = porNome(p.tasks);
    for (const [k, b] of B) {
      const a = A.get(k), t = T.get(k);
      if (!a || !t || t.nova || t.interna || t.corrige != null) continue;
      dias.push({ chave: chaveDaTarefa(t), nome: t.nome, obra: d.id, razao: Math.max(1, b.dur) / diasSemLicao(t, a), peso: 1, fonte: "validacao" });
    }
  }
  return { dias, horas };
}

/** A mediana pesada. */
function mediana(x: { v: number; w: number }[]): number {
  const s = [...x].sort((a, b) => a.v - b.v), tot = s.reduce((a, y) => a + y.w, 0);
  let acc = 0;
  for (const y of s) { acc += y.w; if (acc >= tot / 2) return y.v; }
  return s[s.length - 1]?.v ?? 1;
}

/** O erro do plano gerado numa obra: os dias (e as horas) das tarefas acabadas contra o que o motor gerou. */
export function erroDaObra(d: Pick<Negocio, "id" | "nome" | "obra">): ErroObra | null {
  const p = d.obra?.plano, gerado = p ? geradoDe(p) : null;
  if (!p || !gerado) return null;
  const G = porNome(gerado), vez = new Map<string, number>();
  let n = 0, sd = 0, bd = 0, sh = 0, bh = 0;
  for (const t of p.tasks) {
    const k = vez.get(t.nome) ?? 0; vez.set(t.nome, k + 1);
    const g = G.get(`${t.nome}#${k}`);
    if (!g || !acabada(t) || t.corrige != null) continue;
    const real = diasReais(t);
    if (!real) continue;
    n++; sd += Math.abs(real - Math.max(1, g.dur)); bd += Math.max(1, g.dur);
    if (g.h > 0 && (t.exec?.horas ?? 0) > 0) { sh += Math.abs(t.exec!.horas - g.h); bh += g.h; }
  }
  if (!n) return null;
  return { negocio: d.id, nome: d.nome, inicio: p.inicio ?? null, tarefas: n, erroDias: r2(sd / bd), erroHoras: bh > 0 ? r2(sh / bh) : null, comLicoes: p.tasks.some((t) => !!t.aprendido) };
}

/** Tudo o que as obras ensinam, de todos os negócios carregados (menos `exceto`, a obra que se está a planear). */
export function aprender(deals: readonly Negocio[], exceto?: number): Aprendizagem {
  const obs: Observacao[] = [], oh: ObsHoras[] = [], erros: ErroObra[] = [];
  for (const d of deals) {
    if (d.id === exceto || d.perdido || !d.obra?.plano) continue;
    try {
      const o = observacoesDaObra(d);
      obs.push(...o.dias); oh.push(...o.horas);
      const e = erroDaObra(d);
      if (e) erros.push(e);
    } catch { /* um plano estragado não para a aprendizagem */ }
  }
  const licoes = new Map<string, Licao>();
  const grupos = new Map<string, Observacao[]>();
  for (const x of obs) grupos.set(x.chave, [...(grupos.get(x.chave) ?? []), x]);
  for (const [chave, L] of grupos) {
    const razao = r2(Math.min(LIMITES[1], Math.max(LIMITES[0], mediana(L.map((x) => ({ v: x.razao, w: x.peso }))))));
    const obras = new Set(L.map((x) => x.obra)).size;
    licoes.set(chave, { chave, nome: L[0].nome, razao, obras, observacoes: L.length, aplica: obras >= MIN_OBRAS && Math.abs(razao - 1) >= MIN_DESVIO });
  }
  const catalogo: PropostaCatalogo[] = [];
  const gh = new Map<string, ObsHoras[]>();
  for (const x of oh) gh.set(x.chave, [...(gh.get(x.chave) ?? []), x]);
  for (const [chave, L] of gh) {
    const obras = new Set(L.map((x) => x.obra)).size;
    const previstas = L.reduce((a, x) => a + x.previstas, 0), reais = L.reduce((a, x) => a + x.reais, 0);
    const razao = r2(reais / previstas);
    if (obras >= MIN_OBRAS && Math.abs(razao - 1) >= MIN_DESVIO) catalogo.push({ chave, nome: L[0].nome, razao, obras, previstas: r2(previstas), reais: r2(reais) });
  }
  catalogo.sort((a, b) => Math.abs(b.razao - 1) - Math.abs(a.razao - 1));
  erros.sort((a, b) => (a.inicio ?? "").localeCompare(b.inicio ?? ""));
  return { licoes, catalogo, erros, observacoes: obs.length };
}

/** Os dias de uma tarefa nova com a lição (se ela valer sozinha): a duração corrigida, ao meio dia. */
export function diasComLicao(L: Map<string, Licao> | null | undefined, chave: string, dias: number): { dias: number; licao: Licao } | null {
  const l = L?.get(chave);
  if (!l?.aplica) return null;
  const novo = meioDia(dias * l.razao);
  return novo !== dias ? { dias: novo, licao: l } : null;
}

/** O erro médio do motor nas últimas obras (para dizer se está a melhorar): as primeiras contra as últimas. */
export function tendenciaDoErro(erros: ErroObra[]): { antes: number; agora: number } | null {
  if (erros.length < 4) return null;
  const meio = Math.floor(erros.length / 2), med = (l: ErroObra[]) => r2(l.reduce((a, e) => a + e.erroDias, 0) / l.length);
  return { antes: med(erros.slice(0, meio)), agora: med(erros.slice(meio)) };
}
