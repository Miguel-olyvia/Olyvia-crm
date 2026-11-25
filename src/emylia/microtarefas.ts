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
import { microtarefasDoServico } from "./real/microtarefasServico";

/** Uma microtarefa: o id (estável), o texto e as horas previstas (as do Catálogo; as juntadas à mão não têm). 25/11: `ref`, a tarefa da
 *  Mudelar no Infraspeak de onde veio (a checklist e quem faz lêem-se dela: dados/infraspeakMudelar.ts; não se gravam com o plano). */
export interface Micro { id: number; n: string; h?: number; ref?: string;
  /** 25/11 (Rúben: os «1 dia» do Infraspeak «são espera»): dias de espera (secagem, cura): contam nos dias da tarefa, não nas horas */ dias?: number;
  /** 25/11: a checklist e quem faz, quando vêm da ficha do serviço e não são as da tarefa do Infraspeak (`ref`) */ det?: string[]; quem?: string }
/** De onde vem a lista que se mostra. */
export type OrigemMicro = "obra" | "servico" | "infraspeak" | "catalogo" | "instrucoes";

/** 25/11: as tarefas reais da Mudelar no Infraspeak para esta tarefa do plano (microtarefasMudelar.ts). */
export const microDoInfraspeak = (t: Tarefa, p?: Plano | null): Micro[] =>
  tarefasMudelarDe(t, p).map((x, id) => ({ id, n: x.n, ...(x.h ? { h: x.h } : {}), ...(x.dias ? { dias: x.dias } : {}), ref: x.ref }));
/** 25/11: uma microtarefa do Infraspeak que é espera («1 day»), gravada antes como 8 h por dia: passa a dias de espera (sem horas). */
export function comEspera(m: Micro): Micro {
  const x = tarefaMudelar(m.ref);
  if (!x?.dias || m.dias != null) return m;
  if (m.h != null && Math.abs(m.h - 8 * x.dias) > 0.01) return m;
  const { h: _h, ...resto } = m;
  return { ...resto, dias: x.dias };
}
/** A checklist e quem faz de uma microtarefa: os da ficha do serviço, senão os da tarefa do Infraspeak de onde veio. */
export function detalheMicro(m: Micro): { quem?: string; det: string[] } {
  const x = tarefaMudelar(m.ref);
  return { ...(m.quem ?? x?.quem ? { quem: m.quem ?? x?.quem } : {}), det: m.det ?? x?.det ?? [] };
}

/** Uma parte de um «MO Modelo» (várias tarefas do mesmo serviço, uma por ofício): a lista do serviço seria a da obra toda. */
const ehParte = (t: Tarefa, p?: Pick<Plano, "tasks"> | null): boolean => !!t.svcs[0] && !!p && p.tasks.filter((x) => x.svcs[0] === t.svcs[0]).length > 1;

/** 25/11: as microtarefas da ficha do serviço no Catálogo da organização (real/microtarefasServico.ts). A checklist e quem faz só se
 *  guardam na microtarefa quando diferem das da tarefa do Infraspeak de onde vieram. */
export function microDoServico(t: Tarefa, p?: Plano | null): Micro[] {
  if (ehParte(t, p)) return [];
  const L = microtarefasDoServico(t.svcs[0]);
  if (!L) return [];
  return L.map((x, id) => {
    const r = tarefaMudelar(x.ref), igual = !!r && r.det.length === x.checklist.length && r.det.every((d, k) => d === x.checklist[k]);
    return { id, n: x.nome, ...(x.horas != null ? { h: x.horas } : {}), ...(x.ref ? { ref: x.ref } : {}),
      ...(!igual && x.checklist.length ? { det: x.checklist } : {}), ...(x.quem && x.quem !== r?.quem ? { quem: x.quem } : {}) };
  });
}
/** A proposta para uma tarefa: a lista da ficha do serviço; sem ela, as tarefas da Mudelar no Infraspeak para este trabalho. */
function propostaSo(t: Tarefa, p?: Plano | null): { L: Micro[]; origem: "servico" | "infraspeak" } | null {
  const s = microDoServico(t, p);
  if (s.length) return { L: s, origem: "servico" };
  const i = microDoInfraspeak(t, p);
  return i.length ? { L: i, origem: "infraspeak" } : null;
}
/** 25/11 (obra 1048: «Demolição e remoção» e o extra «Demolição de parede» com as mesmas 21 tarefas): numa obra, cada tarefa do Infraspeak
 *  (ref) fica numa só tarefa do plano: na que tem mais horas (empate: a primeira). As outras não a repetem; uma lista que fica vazia
 *  deixa a tarefa com o Catálogo ou as instruções. */
function donoDasRefs(p: Plano): Map<string, Tarefa> {
  const dono = new Map<string, Tarefa>();
  for (const x of p.tasks) {
    for (const m of propostaSo(x, p)?.L ?? []) {
      if (!m.ref) continue;
      const atual = dono.get(m.ref);
      if (!atual || x.h > atual.h) dono.set(m.ref, x);
    }
  }
  return dono;
}
const cacheDono = new WeakMap<Plano, { chave: string; dono: Map<string, Tarefa> }>();
function donoDe(p: Plano): Map<string, Tarefa> {
  const chave = p.tasks.map((x) => `${x.nome}|${x.svcs[0] ?? ""}|${x.h}|${x.fase ?? ""}`).join("~");
  const c = cacheDono.get(p);
  if (c && c.chave === chave) return c.dono;
  const dono = donoDasRefs(p);
  cacheDono.set(p, { chave, dono });
  return dono;
}
export function propostaMicro(t: Tarefa, p?: Plano | null): { L: Micro[]; origem: "servico" | "infraspeak" } | null {
  const r = propostaSo(t, p);
  if (!r || !p || !p.tasks.includes(t)) return r;
  const dono = donoDe(p);
  const L = r.L.filter((m) => !m.ref || dono.get(m.ref) === t).map((m, id) => ({ ...m, id }));
  return L.length ? { L, origem: r.origem } : null;
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
 *  4. 25/11: a lista da ficha do serviço no Catálogo; sem ela, as tarefas da Mudelar no Infraspeak para este trabalho;
 *  5. os passos do Catálogo (dois ou mais);
 *  6. as instruções pelo nome da tarefa.
 * Uma tarefa de correção tem sempre as instruções do pedido.
 */
export function microtarefasDe(t: Tarefa, S?: Estado | null, p?: Plano | null): { L: Micro[]; origem: OrigemMicro } {
  const r = microtarefasCru(t, S, p);
  return { ...r, L: r.L.map(comEspera) };
}
function microtarefasCru(t: Tarefa, S?: Estado | null, p?: Plano | null): { L: Micro[]; origem: OrigemMicro } {
  if (t.micro) return { L: t.micro.map((m) => ({ ...m })), origem: "obra" };
  const instrucoes = { L: microDasInstrucoes(t), origem: "instrucoes" as const };
  if (t.corrige != null || t.exec?.microDe === "instrucoes") return instrucoes;
  if (t.exec?.passos?.length && !t.exec.microDe) return instrucoes;
  const prop = t.exec?.microDe === "catalogo" ? null : propostaMicro(t, p);
  if (prop) return prop;
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
  const inf = propostaMicro(t, p)?.L ?? [];
  const marcas = t.exec?.passos ?? [];
  if (!inf.length) {
    // 25/11: uma lista posta pela app (do Infraspeak) que esta tarefa já não tem (outra tarefa da obra ficou com essas tarefas): volta à
    // lista de sempre (os passos do Catálogo ou as instruções)
    if (t.micro && !t.microMao && !marcas.length && !t.exec && t.micro.length && t.micro.every((m) => m.ref)) {
      const c = microDoCatalogo(S, t, p);
      return c.length >= 2 ? c : microDasInstrucoes(t);
    }
    if (t.micro) return null;
    const r = microtarefasDe(t, S, p);
    return r.origem === "catalogo" && !marcas.length ? r.L : null;
  }
  // 25/11 (obra 1048): uma lista posta pela app (nem mudada à mão, nem marcada pelo técnico) troca-se pela proposta certa, por inteiro
  const chaveP = (m: Micro) => m.ref ?? 'n:' + m.n;
  if (t.micro && !t.microMao && !marcas.length && !t.exec) {
    const iguais = t.micro.length === inf.length && t.micro.every((m, k) => chaveP(m) === chaveP(inf[k]) && m.n === inf[k].n);
    return iguais ? null : inf;
  }
  // a lista que existe: a da obra; sem ela, aquela em que o técnico marcou (se marcou)
  const base = t.micro ? t.micro.map((m) => ({ ...m })) : marcas.length ? microtarefasDe(t, S, p).L : [];
  if (!base.length) return inf;
  // cada microtarefa da proposta pela sua chave (a tarefa do Infraspeak; sem ela, o nome)
  const chave = (m: Micro) => m.ref ?? "n:" + m.n;
  const jaTem = new Set(base.map(chave));
  if (inf.every((x) => jaTem.has(chave(x)))) return null;
  const feitas = microFeitas(t, base);
  let livre = Math.max(-1, ...base.map((m) => m.id), ...marcas) + 1;
  const usadas = new Set<string>();
  const L = base.map((m, k) => {
    const x = inf[k];
    if (!x || feitas.has(m.id) || (m.ref && jaTem.has(m.ref)) || jaTem.has(chave(x))) return m;
    usadas.add(chave(x));
    const { id: _id, ...resto } = x;
    return { ...resto, id: m.id };
  });
  for (const x of inf) if (!usadas.has(chave(x)) && !jaTem.has(chave(x))) L.push({ ...x, id: livre++ });
  return L;
}
export const listaMicro = (t: Tarefa, S?: Estado | null, p?: Plano | null): Micro[] => microtarefasDe(t, S, p).L;

/** 25/11 (Rúben: «30 microtarefas que somam mais de 20 h e o plano diz 2 dias: está errado; cria uma regra que ajusta o plano»). As horas
 *  que as microtarefas da tarefa somam (as do Infraspeak ou da ficha do serviço); null sem horas nelas ou com as instruções gerais.
 *  A regra (motor: ajustarHorasPelasMicro): uma tarefa nunca tem menos horas no plano do que esta soma. */
export function horasDasMicro(t: Tarefa, S?: Estado | null, p?: Plano | null): number | null {
  const r = microtarefasDe(t, S, p);
  if (r.origem === "instrucoes" || r.origem === "catalogo") return null;
  const h = r.L.reduce((a, m) => a + (m.h ?? 0), 0);
  return h > 0 ? r2(h) : null;
}
/** Os dias de espera das microtarefas (secagens e curas: os «1 day» do Infraspeak). 25/11 (Rúben: «só a maior»): as esperas de uma
 *  tarefa correm ao mesmo tempo (as paredes e o chão secam juntos): conta a maior, não a soma. */
export function esperaDasMicro(t: Tarefa, S?: Estado | null, p?: Plano | null): number {
  const r = microtarefasDe(t, S, p);
  if (r.origem === "instrucoes" || r.origem === "catalogo") return 0;
  return r.L.reduce((a, m) => Math.max(a, m.dias ?? 0), 0);
}
/** A soma das esperas (como a regra as contava antes de 25/11, para corrigir os dias que ficaram a mais). */
function esperaSomada(t: Tarefa, S?: Estado | null, p?: Plano | null): number {
  const r = microtarefasDe(t, S, p);
  if (r.origem === "instrucoes" || r.origem === "catalogo") return 0;
  return r.L.reduce((a, m) => a + (m.dias ?? 0), 0);
}
const meia = (h: number) => Math.max(0.5, Math.round(h * 2) / 2);
const diasDe = (h: number) => Math.max(1, Math.ceil(h / 8 - 1e-9));
/**
 * O ajuste que a regra pede a uma tarefa por começar (ou null):
 *  · as horas nunca abaixo das que as microtarefas somam (só trabalho);
 *  · os dias nunca abaixo dos dias desse trabalho mais os dias de espera;
 *  · 25/11 (Rúben: «são espera»): horas que a regra subiu antes contando a espera como 8 h por dia voltam ao trabalho real (sem descer
 *    abaixo das horas do orçamento, `hOrc`).
 */
export function ajustePorFazer(t: Tarefa, S?: Estado | null, p?: Plano | null, hOrc?: number): { h: number; dur: number } | null {
  if (t.exec || t.corrige != null) return null;
  // as horas do orçamento (a base do plano), quando a base está alinhada com as tarefas: o motor e os contadores contam igual
  if (hOrc == null && p?.base && p.base.length === p.tasks.length) hOrc = p.base[p.tasks.indexOf(t)]?.h;
  const soma = horasDasMicro(t, S, p), espera = esperaDasMicro(t, S, p);
  if (soma == null && !espera) return null;
  let h = t.h;
  if (espera && soma != null && Math.abs(t.h - meia(soma + 8 * espera)) < 0.51 && t.h > soma) h = Math.max(soma, hOrc ?? soma);
  if (soma != null && soma > h + 0.25) h = soma;
  h = meia(h);
  // a subir (ou igual), os dias nunca encolhem; a corrigir para baixo (a espera contada como horas), os dias são o trabalho mais a espera
  // sem horas novas nem espera, os dias ficam (uma tarefa com mais pessoas tem menos dias do que horas ÷ 8)
  let dur = h < t.h ? diasDe(h) + espera : h > t.h || espera ? Math.max(diasDe(h) + espera, t.dur) : t.dur;
  // 25/11: dias que a regra pôs com as esperas somadas descem para a maior espera
  const somada = esperaSomada(t, S, p);
  if (somada > espera && h === t.h && t.dur === diasDe(h) + somada) dur = diasDe(h) + espera;
  return h !== t.h || dur !== t.dur ? { h, dur } : null;
}
/** Há alguma coisa a ajustar nesta tarefa (para os contadores). */
export const horasPorSubir = (t: Tarefa, S?: Estado | null, p?: Plano | null): number | null => ajustePorFazer(t, S, p)?.h ?? null;

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
