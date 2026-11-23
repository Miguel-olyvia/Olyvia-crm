// 23/11 (revisão: «Avisar os técnicos afetados»): depois de um replaneamento, de ligar ou tirar uma ligação, de passar uma tarefa a outra
// pessoa (ou de qualquer mudança de dias ou de técnico feita no Estúdio da obra), os técnicos não são avisados logo. O Estúdio junta o que
// mudou para cada um, desde o último aviso, e mostra a lista; só quando o gestor toca em «Avisar» é que o aviso fica no Hoje de cada técnico.
// Anular uma mudança tira-a da lista (a lista é a diferença entre o plano de agora e o do último aviso).
import type { AvisoTec, Plano } from "../motor";
import { TECS } from "../motor";
import { nomeCurtoTarefa } from "./planoVivo";

/** O que, numa tarefa, interessa ao técnico: os dias e quem a faz. */
export interface MarcaTarefa { dia: number; dur: number; tec: string | null }
export const marcasDe = (p: Plano): MarcaTarefa[] => p.tasks.map((t) => ({ dia: t.dia, dur: t.dur, tec: t.tec ?? null }));

/** O plano está nas mãos dos técnicos (aprovado ou em curso): só aí há avisos a dar. */
export const comTecnicos = (p: Plano | undefined | null): p is Plano => !!p && (p.estado === "em curso" || p.estado === "aprovado");

/** Um aviso por dar: a quem, de que tarefa, e o texto que fica no Hoje dele. */
export interface AvisoPorDar { tec: string; ti: number; t: string }

const primeiro = (tec: string) => (TECS.find((x) => x.id === tec)?.n ?? tec).split(" ")[0];

/** O que mudou para cada técnico entre o plano do último aviso (`base`) e o de agora. `quando` dá a data de um dia do plano. */
export function avisosPorDar(p: Plano, base: MarcaTarefa[], quando: (k: number) => string): AvisoPorDar[] {
  if (base.length !== p.tasks.length) return [];
  const dias = (m: MarcaTarefa) => (m.dur > 1 ? `${quando(m.dia)} a ${quando(m.dia + m.dur - 1)}` : quando(m.dia));
  const out: AvisoPorDar[] = [];
  p.tasks.forEach((t, ti) => {
    if (t.exec?.estado === "feita" || t.exec?.estado === "validada") return;
    const a = base[ti], b: MarcaTarefa = { dia: t.dia, dur: t.dur, tec: t.tec ?? null }, nome = nomeCurtoTarefa(t.nome);
    if (a.tec !== b.tec) {
      if (b.tec) out.push({ tec: b.tec, ti, t: `Tem uma tarefa nova: ${nome}, ${dias(b)}` });
      if (a.tec) out.push({ tec: a.tec, ti, t: `${nome} passou para ${b.tec ? primeiro(b.tec) : "outra pessoa"}: já não é consigo` });
    } else if (b.tec && (a.dia !== b.dia || a.dur !== b.dur)) {
      out.push({ tec: b.tec, ti, t: `${nome}: passa a ${dias(b)} (era ${dias(a)})` });
    }
  });
  return out;
}

/** Os avisos por dar, por técnico (para a lista). */
export function porTecnico(L: AvisoPorDar[]): { tec: string; itens: AvisoPorDar[] }[] {
  const m = new Map<string, AvisoPorDar[]>();
  for (const x of L) m.set(x.tec, [...(m.get(x.tec) ?? []), x]);
  return [...m].map(([tec, itens]) => ({ tec, itens }));
}

/** Depois de uma mudança feita no Estúdio: os avisos que o motor deu logo, das tarefas que mudaram de dias ou de técnico, saem (ficam
 *  na lista por dar, com o toque do gestor). Os outros avisos (uma pausa, uma tarefa reaberta, os materiais) ficam como estavam. */
export function segurarAvisos(p: Plano, antes: AvisoTec[], marcasAntes: MarcaTarefa[]): void {
  if (marcasAntes.length !== p.tasks.length || !p.avisos) return;
  const mudou = new Set(p.tasks.map((t, ti) => ti).filter((ti) => {
    const a = marcasAntes[ti], t = p.tasks[ti];
    return a.dia !== t.dia || a.dur !== t.dur || a.tec !== (t.tec ?? null);
  }));
  if (!mudou.size) return;
  const ja = new Set(antes.map((a) => JSON.stringify(a)));
  const novos = p.avisos.filter((a) => !ja.has(JSON.stringify(a)));
  if (!novos.some((a) => mudou.has(a.ti))) return;
  const L: AvisoTec[] = antes.map((a) => ({ ...a }));
  for (const a of novos) {
    if (mudou.has(a.ti)) continue;
    const k = a.ti >= 0 ? L.findIndex((x) => x.tec === a.tec && x.ti === a.ti && !x.lido) : -1;
    if (k >= 0) L[k] = a; else L.push(a);
  }
  p.avisos = L;
}
