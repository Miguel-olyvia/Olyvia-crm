/**
 * Chegada à obra pelo QR: que tarefas são "de hoje" nesta obra, e qual é a
 * primeira (a que o relógio começa ao registar a chegada). Puro.
 */

export interface TarefaParaChegada {
  id: string;
  estado: string;
  inicio_planeado: string | null;
  fase_ordem: number;
  ordem: number;
  depende_de: string | null;
}

const ABERTA = new Set(["por_fazer", "em_curso", "rejeitada"]);

/** Abertas e para hoje: em curso, para refazer, sem data, ou com início até hoje. */
export function tarefasDeHoje<T extends TarefaParaChegada>(tarefas: readonly T[], hoje: string): T[] {
  return tarefas.filter(
    (t) =>
      ABERTA.has(t.estado) &&
      (t.estado !== "por_fazer" || !t.inicio_planeado || t.inicio_planeado <= hoje)
  );
}

const PESO: Record<string, number> = { em_curso: 0, rejeitada: 1, por_fazer: 2 };

/**
 * A primeira tarefa do dia: a que já está em curso; senão a que voltou para
 * refazer; senão a por fazer mais cedo no plano (fase, ordem) cuja
 * dependência — se a conheço — já está feita. null se não houver.
 */
export function primeiraTarefaDoDia<T extends TarefaParaChegada>(
  tarefas: readonly T[],
  hoje: string
): T | null {
  const porId = new Map(tarefas.map((t) => [t.id, t]));
  const livres = tarefasDeHoje(tarefas, hoje).filter((t) => {
    const dep = t.depende_de ? porId.get(t.depende_de) : null;
    return !dep || dep.estado === "feita" || dep.estado === "validada";
  });
  livres.sort(
    (a, b) =>
      (PESO[a.estado] ?? 9) - (PESO[b.estado] ?? 9) ||
      (a.inicio_planeado ?? "9999").localeCompare(b.inicio_planeado ?? "9999") ||
      a.fase_ordem - b.fase_ordem ||
      a.ordem - b.ordem
  );
  return livres[0] ?? null;
}
