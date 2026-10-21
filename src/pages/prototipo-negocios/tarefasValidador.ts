// O validador do plano mexe nas tarefas (21/10/2026), antes de a obra arrancar: juntar uma tarefa nova numa fase (a partir de um
// serviço do Catálogo: o ofício, as horas e os materiais vêm dele), o técnico, os materiais (editáveis), mudar de fase e tirar
// as tarefas que ele próprio juntou. As do orçamento não se tiram (a base guarda-as para "Repor o plano do orçamento").
// Funções puras sobre o Plano; o motor chama-as (A.novaTarefaPlano, A.moverTarefaPlano, A.tirarTarefaPlano, A.matsTarefa).
import { HORAS_DIA } from "./ganttOrcamento";
import { encadearFases, fimDe, guardarBase, inicioMinimo, mudarInicio } from "./ajustesPlano";
import { RECEITAS } from "./receitas";
import { TECS, diaDeFerias, type AvisoTec, type MatTarefa, type Plano, type Servico, type SvcId, type Tarefa } from "./motor";
import { skDaTarefa } from "./preparacaoObra";

const r2 = (x: number) => Math.round(x * 100) / 100;
/** As unidades que não se partem (um kit, um tubo, um saco): arredondam para cima. */
const INTEIRAS = /^(un|kit|tubo|saco|sacos|cx|pç)$/i;

/** Os materiais de um serviço para `q` unidades dele: os consumíveis da receita, com a quantidade e o preço. */
export function materiaisDoServico(sid: SvcId, q: number): MatTarefa[] {
  const R = RECEITAS[sid];
  if (!R) return [];
  return R.cons.map((c) => {
    const x = c.q * q;
    return { n: c.n, q: INTEIRAS.test(c.un) ? Math.max(1, Math.ceil(x - 1e-9)) : r2(x), un: c.un, preco: c.preco, forn: c.fornecedor };
  });
}

/** Os materiais de uma tarefa: os que se escolheram à mão; senão, os das receitas dos serviços dela (pelas horas). */
export function materiaisDaTarefa(t: Tarefa, svc: Record<SvcId, Servico>): MatTarefa[] {
  if (t.mats) return t.mats;
  return t.svcs.flatMap((sid) => {
    const s = svc[sid];
    return s && s.h > 0 ? materiaisDoServico(sid, t.h / t.svcs.length / s.h) : [];
  });
}

/** Todos os consumíveis conhecidos (para juntar um à mão), sem repetir o nome. */
export function consumiveisConhecidos(): MatTarefa[] {
  const vistos = new Map<string, MatTarefa>();
  for (const R of Object.values(RECEITAS)) for (const c of R.cons) if (!vistos.has(c.n)) vistos.set(c.n, { n: c.n, q: 1, un: c.un, preco: c.preco, forn: c.fornecedor });
  return [...vistos.values()].sort((a, b) => a.n.localeCompare(b.n, "pt"));
}

/** As horas e os dias úteis de `q` unidades de um serviço (8 h por dia, pelo menos 1 dia). */
export function tempoDoServico(s: Servico, q: number): { h: number; dur: number } {
  const h = r2(s.h * q);
  return { h, dur: Math.max(1, Math.ceil(h / HORAS_DIA - 1e-9)) };
}

/** O primeiro técnico do ofício livre nesses dias (senão o primeiro do ofício; senão ninguém). */
export function tecnicoLivre(p: Plano, sk: string, dia: number, dur: number): string | null {
  const doOficio = TECS.filter((x) => x.sk === sk);
  return (doOficio.find((x) => diaDeFerias(x, p, dia, dur) == null) ?? doOficio[0])?.id ?? null;
}

/** O primeiro dia de uma tarefa nova na fase: depois das fases anteriores; com a obra em curso (o gestor), nunca num dia que já passou. */
export function diaMinimo(p: Plano, fase: number): number {
  const hoje = p.estado === "em curso" ? p.dia : 0;
  return Math.max(hoje, fase ? Math.max(0, fimDe(p.tasks.filter((x) => (x.fase ?? 0) > 0 && (x.fase ?? 0) < fase)) - 1) : 0);
}

export interface NovaTarefa { sid: SvcId; q: number; fase: number; tec?: string | null; mats?: MatTarefa[]; dia?: number }

/** A tarefa nova, pronta a juntar: começa no primeiro dia possível da fase (ou no dia pedido), com o técnico livre do ofício. */
export function criarTarefa(p: Plano, s: Servico, n: NovaTarefa): Tarefa {
  const { h, dur } = tempoDoServico(s, n.q);
  const sk = skDaTarefa(s.perfil, s.n);
  const t: Tarefa = { nome: s.n, svcs: [n.sid], dia: 0, dur, sk, h, tec: null, fase: n.fase || undefined, nova: true, q: n.q, mats: n.mats ?? materiaisDoServico(n.sid, n.q) };
  // o primeiro dia possível: depois das fases anteriores; sem pedido, no fim do que já está na mesma fase
  const naFase = p.tasks.filter((x) => (x.fase ?? 0) === (n.fase ?? 0));
  const min = diaMinimo(p, n.fase);
  t.dia = Math.max(min, n.dia ?? (naFase.length ? Math.min(...naFase.map((x) => x.dia)) : min));
  t.tec = n.tec !== undefined ? n.tec : tecnicoLivre(p, sk, t.dia, dur);
  return t;
}

/** Junta a tarefa ao plano (a base do orçamento fica guardada antes) e encadeia as fases. Devolve o índice. */
export function juntarTarefa(p: Plano, t: Tarefa): number {
  guardarBase(p);
  p.tasks.push(t);
  encadearFases(p);
  return p.tasks.length - 1;
}

/** Só as tarefas juntadas pelo validador se tiram (as do orçamento ficam na base). */
export const podeTirar = (p: Plano, ti: number): boolean => !!p.tasks[ti]?.nova && ti >= (p.base?.length ?? 0);
export function tirarTarefa(p: Plano, ti: number): boolean {
  if (!podeTirar(p, ti)) return false;
  p.tasks.splice(ti, 1);
  // os avisos dessa tarefa deixam de apontar para ela; os das seguintes andam um para trás
  p.avisos = p.avisos?.map((a) => (a.ti === ti ? { ...a, ti: -1 } : a.ti > ti ? { ...a, ti: a.ti - 1 } : a));
  return true;
}

/** Muda a tarefa de fase (e, se vier, de dia): não começa antes do fim da fase anterior; as fases seguintes empurram-se. */
export function moverTarefa(p: Plano, ti: number, m: { fase?: number; dia?: number }): void {
  const t = p.tasks[ti];
  if (!t) return;
  guardarBase(p);
  if (m.fase != null && m.fase !== t.fase) t.fase = m.fase || undefined;
  mudarInicio(p, ti, Math.max(m.dia ?? t.dia, inicioMinimo(p, ti)));
}

/* ------------------------------------------------------------------ os avisos aos técnicos */
/**
 * Avisa o técnico (o da tarefa, ou outro) de uma tarefa nova ou mudada: aparece no Hoje dele até a ver.
 * Várias mudanças seguidas à mesma tarefa (arrastar, − / +) juntam-se num aviso só, o último, enquanto ele não o viu.
 */
export function avisarTecnico(p: Plano, ti: number, t: string, q: string, tec: string | null = p.tasks[ti]?.tec ?? null): void {
  if (!tec || p.estado === "concluída") return;
  const L = (p.avisos ??= []);
  const k = ti >= 0 ? L.findIndex((a) => a.tec === tec && a.ti === ti && !a.lido) : -1;
  const a: AvisoTec = { tec, ti, t, q };
  if (k >= 0) L[k] = a; else L.push(a);
}

/** Os avisos de um técnico por ver (com o índice, para marcar como visto). */
export const avisosPorVer = (p: Plano, tec: string): { a: AvisoTec; k: number }[] =>
  (p.avisos ?? []).map((a, k) => ({ a, k })).filter(({ a }) => a.tec === tec && !a.lido);

/** O último aviso de uma tarefa (para o gestor ver se o técnico já o viu). */
export const ultimoAviso = (p: Plano, ti: number): AvisoTec | null =>
  [...(p.avisos ?? [])].reverse().find((a) => a.ti === ti && a.tec === p.tasks[ti]?.tec) ?? null;
