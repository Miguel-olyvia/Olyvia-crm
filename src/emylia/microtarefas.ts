// 24/11 (Rúben: «cada tarefa do plano pode e deve ter microtarefas, para o técnico ir marcando»). As microtarefas de uma tarefa da obra:
// a lista de verificação que o técnico marca no Hoje dele, uma a uma, e cujo progresso o gestor vê no Estúdio da obra.
//  · De onde vêm: os passos da mão de obra do serviço no Catálogo (a mesma lista que o painel mostrava em «O que se faz»), com as horas
//    repartidas pelas horas da tarefa. Numa parte de um «MO Modelo» (uma tarefa por ofício), só os passos desse ofício.
//  · Sem passos no Catálogo, as instruções de sempre pelo nome da tarefa (trabalhoObra.ts: instrucoesDe).
//  · O gestor muda-as só nesta obra (juntar, mudar o texto, mudar a ordem, tirar): a lista fica na tarefa (Tarefa.micro) e a ficha do
//    Catálogo não muda.
//  · O técnico marca-as pelo id (ExecTarefa.passos). Os ids da lista que vem do Catálogo são 0, 1, 2…, os mesmos índices que o «Passo a
//    passo» já guardava: os registos antigos continuam certos. Uma microtarefa juntada à mão tem um id novo (nunca reaproveitado), por isso
//    mudar a ordem ou tirar uma não troca as marcas do técnico.
// Tudo aqui são funções puras; o motor (A.microtarefas) e os ecrãs chamam-nas. Não há tabela nova: a lista grava-se com o plano da obra
// (obra_guardar_negocio), e o técnico só mexe na execução da tarefa dele (exec.passos), que o servidor já lhe deixa gravar.
import { r2, type Estado, type Plano, type Tarefa } from "./motor";
import { custosDe, receitaDe } from "./v2/custosModelo";
import { instrucoesDe } from "./trabalhoObra";
import { tarefaMudelar, tarefasMudelarDe } from "./microtarefasMudelar";

/** Uma microtarefa: o id (estável), o texto e as horas previstas (as do Catálogo; as juntadas à mão não têm). 25/11: `ref`, a tarefa da
 *  Mudelar no Infraspeak de onde veio (a checklist e quem faz lêem-se dela: dados/infraspeakMudelar.ts; não se gravam com o plano). */
export interface Micro { id: number; n: string; h?: number; ref?: string }
/** De onde vem a lista que se mostra. */
export type OrigemMicro = "obra" | "infraspeak" | "catalogo" | "instrucoes";

/** 25/11: as tarefas reais da Mudelar no Infraspeak para esta tarefa do plano (microtarefasMudelar.ts). */
export const microDoInfraspeak = (t: Tarefa, p?: Plano | null): Micro[] =>
  tarefasMudelarDe(t, p).map((x, id) => ({ id, n: x.n, ...(x.h ? { h: x.h } : {}), ref: x.ref }));
/** A checklist e quem faz, de uma microtarefa que veio do Infraspeak. */
export function detalheMicro(m: Micro): { quem?: string; det: string[] } {
  const x = tarefaMudelar(m.ref);
  return x ? { quem: x.quem, det: x.det } : { det: [] };
}

/** Os passos da mão de obra do serviço da tarefa no Catálogo, com as horas repartidas pelas horas da tarefa. [] sem Catálogo. */
export function microDoCatalogo(S: Estado | null | undefined, t: Tarefa, p?: Plano | null): Micro[] {
  const sid = t.svcs[0];
  const s = sid && S ? S.svc[sid] : undefined;
  if (!S || !sid || !s) return [];
  let mo: { n: string; perfil: string; h: number }[];
  try {
    const C = custosDe(S);
    mo = (receitaDe(C, sid, s, S.cfg.alvo)?.mo ?? []).filter((m) => m.h > 0 && (m.n ?? "").trim());
    // numa parte de um «MO Modelo» (várias tarefas do mesmo serviço, uma por ofício), só os passos do ofício dela
    const partes = p ? p.tasks.filter((x) => x.svcs[0] === sid).length : 1;
    if (partes > 1 && mo.length) {
      const nomeDe = (id: string) => C.perfis.find((x) => x.id === id)?.n ?? id;
      const meus = mo.filter((m) => (t.perfilId ? m.perfil === t.perfilId : false) || nomeDe(m.perfil) === t.sk);
      if (meus.length) mo = meus;
    }
  } catch {
    return [];
  }
  const total = mo.reduce((a, m) => a + m.h, 0);
  return mo.map((m, id) => ({ id, n: m.n.trim(), ...(total > 0 && t.h > 0 ? { h: r2((m.h / total) * t.h) } : {}) }));
}

/** As instruções de sempre (pelo nome da tarefa), como microtarefas. */
export const microDasInstrucoes = (t: Tarefa): Micro[] => instrucoesDe(t).passos.map((n, id) => ({ id, n }));

/**
 * A lista de microtarefas de uma tarefa e de onde vem:
 *  1. a desta obra (o gestor mudou-a, ou fixou-a ao abrir o Estúdio);
 *  2. a que o técnico estava a ver quando marcou a primeira (exec.microDe): as marcas são dessa lista;
 *  3. com marcas antigas (de antes de 24/11, sem exec.microDe): as instruções, onde foram marcadas;
 *  4. 25/11: as tarefas da Mudelar no Infraspeak para este trabalho;
 *  5. os passos do Catálogo (dois ou mais);
 *  6. as instruções pelo nome da tarefa.
 * Uma tarefa de correção tem sempre as instruções do pedido.
 */
export function microtarefasDe(t: Tarefa, S?: Estado | null, p?: Plano | null): { L: Micro[]; origem: OrigemMicro } {
  if (t.micro) return { L: t.micro.map((m) => ({ ...m })), origem: "obra" };
  const instrucoes = { L: microDasInstrucoes(t), origem: "instrucoes" as const };
  if (t.corrige != null || t.exec?.microDe === "instrucoes") return instrucoes;
  if (t.exec?.passos?.length && !t.exec.microDe) return instrucoes;
  const inf = t.exec?.microDe === "catalogo" ? [] : microDoInfraspeak(t, p);
  if (inf.length) return { L: inf, origem: "infraspeak" };
  // uma lista de verificação de um item só («Execução») não ajuda o técnico: aí ficam as instruções
  const c = microDoCatalogo(S, t, p);
  return c.length >= 2 ? { L: c, origem: "catalogo" } : instrucoes;
}
/** A lista a gravar na tarefa ao abrir o Estúdio (ou null se não muda):
 *  · sem lista própria e sem marcas: a que se mostra, se vem do Infraspeak ou do Catálogo (o técnico pode não ler o Catálogo);
 *  · 25/11 (Rúben: «refaz todos os serviços, faz overwrite sem comprometer o que já existe nos planos de obras: apenas alterar nomes e
 *    adicionar novos»): com as tarefas do Infraspeak para este trabalho, a lista que já existe (a da obra, ou aquela em que o técnico
 *    marcou) passa a elas pela ordem: cada microtarefa fica com o seu id e muda só o nome (e as horas); as que o técnico já marcou ficam
 *    como estão; as do Infraspeak que sobram juntam-se no fim, com ids novos; nada se apaga. Só uma vez (depois já têm a referência). */
export function porFixar(t: Tarefa, S?: Estado | null, p?: Plano | null): Micro[] | null {
  if (t.exec?.estado === "validada" || t.corrige != null) return null;
  const inf = microDoInfraspeak(t, p);
  const marcas = t.exec?.passos ?? [];
  if (!inf.length) {
    if (t.micro) return null;
    const r = microtarefasDe(t, S, p);
    return r.origem === "catalogo" && !marcas.length ? r.L : null;
  }
  // a lista que existe: a da obra; sem ela, aquela em que o técnico marcou (se marcou)
  const base = t.micro ? t.micro.map((m) => ({ ...m })) : marcas.length ? microtarefasDe(t, S, p).L : [];
  if (!base.length) return inf;
  const jaTem = new Set(base.map((m) => m.ref).filter(Boolean));
  if (inf.every((x) => jaTem.has(x.ref))) return null;
  const feitas = microFeitas(t, base);
  let livre = Math.max(-1, ...base.map((m) => m.id), ...marcas) + 1;
  const usadas = new Set<string>();
  const L = base.map((m, k) => {
    const x = inf[k];
    if (!x || feitas.has(m.id) || (m.ref && jaTem.has(m.ref))) return m;
    usadas.add(x.ref!);
    return { id: m.id, n: x.n, ...(x.h ? { h: x.h } : {}), ref: x.ref };
  });
  for (const x of inf) if (!usadas.has(x.ref!) && !jaTem.has(x.ref)) L.push({ ...x, id: livre++ });
  return L;
}
export const listaMicro = (t: Tarefa, S?: Estado | null, p?: Plano | null): Micro[] => microtarefasDe(t, S, p).L;

/** As microtarefas marcadas pelo técnico (os ids), só as que ainda estão na lista. */
export function microFeitas(t: Tarefa, L: Micro[]): Set<number> {
  const ids = new Set(L.map((m) => m.id));
  return new Set((t.exec?.passos ?? []).filter((k) => ids.has(k)));
}

/** Quantas estão feitas e quantas são (uma tarefa validada conta tudo como feito). */
export function progressoMicro(t: Tarefa, S?: Estado | null, p?: Plano | null): { feitas: number; total: number } {
  const L = listaMicro(t, S, p);
  if (t.exec?.estado === "validada") return { feitas: L.length, total: L.length };
  return { feitas: microFeitas(t, L).size, total: L.length };
}

/** O texto das microtarefas marcadas (pela ordem da lista), para o registo do dia. */
export const nomesFeitos = (t: Tarefa, L: Micro[]): string[] => { const f = microFeitas(t, L); return L.filter((m) => f.has(m.id)).map((m) => m.n); };

/* ------------------------------------------------------------------ o gestor muda a lista desta obra */
export type MudancaMicro =
  | { k: "juntar"; n: string }
  | { k: "mudar"; id: number; n: string }
  | { k: "mover"; id: number; para: number }
  | { k: "tirar"; id: number };

const limpo = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 200);

/** Fixa na tarefa a lista que se mostra (antes de a mudar). */
export function fixarMicro(t: Tarefa, S?: Estado | null, p?: Plano | null): Micro[] {
  if (!t.micro) t.micro = listaMicro(t, S, p);
  return t.micro;
}

/** Aplica uma mudança à lista desta obra. Devolve o texto do que mudou (para o histórico), ou null se nada mudou. */
export function mudarMicro(t: Tarefa, m: MudancaMicro, S?: Estado | null, p?: Plano | null): string | null {
  const antes = t.micro;
  const L = [...fixarMicro(t, S, p)];
  const i = "id" in m ? L.findIndex((x) => x.id === m.id) : -1;
  let texto: string | null = null;
  if (m.k === "juntar") {
    const n = limpo(m.n);
    if (n) {
      // um id que nunca foi usado (nem na lista, nem nas marcas antigas do técnico)
      const id = Math.max(-1, ...L.map((x) => x.id), ...(t.exec?.passos ?? [])) + 1;
      L.push({ id, n });
      texto = `juntou «${n}»`;
    }
  } else if (i >= 0 && m.k === "mudar") {
    const n = limpo(m.n);
    if (n && n !== L[i].n) { texto = `«${L[i].n}» passou a «${n}»`; L[i] = { ...L[i], n }; }
  } else if (i >= 0 && m.k === "mover") {
    const para = Math.max(0, Math.min(L.length - 1, m.para));
    if (para !== i) { const [x] = L.splice(i, 1); L.splice(para, 0, x); texto = `«${x.n}» mudou de lugar`; }
  } else if (i >= 0 && m.k === "tirar") {
    texto = `tirou «${L[i].n}»`;
    L.splice(i, 1);
  }
  if (!texto) { if (antes === undefined) delete t.micro; return null; }
  t.micro = L;
  return texto;
}
