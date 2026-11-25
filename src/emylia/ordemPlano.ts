// 25/11 (Rúben: «drag and drop da lista da primeira coluna»). A ordem das tarefas na lista do plano da obra: por fase e, dentro de cada
// fase, a ordem que o gestor deu ao arrastar (Tarefa.ordem); sem ela, pela data de início. É a ordem da lista, não muda as datas: por isso
// qualquer tarefa (também as começadas ou concluídas) muda de lugar. O Gantt do Estúdio, o Hoje do técnico e o portal do cliente seguem-na.
import type { Plano } from "./motor";

/** Os índices das tarefas pela ordem da lista: fase; dentro da fase, as que têm lugar marcado, depois as outras pela data. */
export function ordemDasTarefas(p: Pick<Plano, "tasks">): number[] {
  return p.tasks.map((t, i) => ({ t, i })).sort((a, b) => {
    const f = (a.t.fase ?? 1) - (b.t.fase ?? 1);
    if (f) return f;
    const oa = a.t.ordem, ob = b.t.ordem;
    if (oa != null && ob != null && oa !== ob) return oa - ob;
    if (oa != null && ob == null) return -1;
    if (oa == null && ob != null) return 1;
    return a.t.dia - b.t.dia || a.i - b.i;
  }).map((x) => x.i);
}

/** As tarefas de uma fase pela ordem da lista. */
export const tarefasDaFase = (p: Pick<Plano, "tasks">, fase: number): number[] => ordemDasTarefas(p).filter((i) => (p.tasks[i].fase ?? 1) === fase);

/** Põe a tarefa `ti` no lugar `para` (0 = a primeira) da sua fase; as da fase ficam todas com o lugar marcado. Devolve se mudou. */
export function moverNaOrdem(p: Pick<Plano, "tasks">, ti: number, para: number): boolean {
  const t = p.tasks[ti];
  if (!t) return false;
  const L = tarefasDaFase(p, t.fase ?? 1), de = L.indexOf(ti), a = Math.max(0, Math.min(L.length - 1, Math.round(para)));
  if (de < 0 || de === a) return false;
  L.splice(de, 1);
  L.splice(a, 0, ti);
  L.forEach((i, k) => { p.tasks[i].ordem = k; });
  return true;
}

/** O lugar de cada tarefa na lista (para ordenar outras listas pela mesma ordem). */
export function lugarNaLista(p: Pick<Plano, "tasks">): Map<number, number> {
  return new Map(ordemDasTarefas(p).map((ti, k) => [ti, k]));
}
