// Decide o lote de lembretes que sai numa corrida dos processadores
// (process-scheduled-emails e process-scheduled-sms). Logica PURA: nao le nem
// escreve na base; quem chama injecta a leitura e o acerto das visitas.
//
// Duas decisoes vivem aqui, porque antes estavam dentro dos dois handlers, sem teste:
//  1. Que linhas entram no lote. As linhas ADIADAS (visita por acertar) continuam
//     pendentes e vencidas; se voltassem a ocupar o lote de 50 em cada corrida, 50
//     linhas em erro persistente impediam todas as outras de sair. Por isso vao-se
//     buscando paginas (das mais antigas para as mais recentes) ate haver o
//     numero pedido de processaveis, ou nao haver mais, excluindo o que ja foi visto.
//  2. O que fazer a cada linha depois de montada (enviar, adiar ou cancelar).

import type { LinkedRender } from "./reminderRunner.ts";

export const DUE_BATCH_SIZE = 50;
/** Limite de paginas por corrida: mantem curta a lista de ids excluidos no pedido. */
export const DUE_MAX_PASSES = 3;

export interface DueRow {
  id: string;
  schedule_item_id?: string | null;
}

/** Uma linha de visita cujo acerto falhou nesta corrida nao sai: fica para a seguinte. */
export function isHeldBack(row: DueRow, unreconciled: ReadonlySet<string>): boolean {
  return !!row.schedule_item_id && unreconciled.has(row.schedule_item_id);
}

export type DueDecision<T> =
  | { kind: "defer"; reason: string }
  | { kind: "cancel"; reason: string }
  | { kind: "send"; content: T | null };

/**
 * O que fazer a uma linha depois de montada. `stored` (e `ok` sem conteudo novo)
 * envia o que ficou guardado na linha (content = null).
 */
export function decideRendered<T>(rendered: LinkedRender<T>): DueDecision<T> {
  if (rendered.kind === "defer") return { kind: "defer", reason: rendered.reason };
  if (rendered.kind === "cancel") return { kind: "cancel", reason: rendered.reason };
  return { kind: "send", content: rendered.kind === "ok" ? rendered.value : null };
}

export interface DueBatch<R> {
  /** Linhas a processar (no maximo `batchSize`). */
  rows: R[];
  /** Visitas cujo acerto falhou: as suas linhas nao entram. */
  unreconciled: Set<string>;
  /** Linhas adiadas por causa dessas visitas (ficam pendentes). */
  deferred: number;
}

export async function collectDueBatch<R extends DueRow>(
  deps: {
    /** Linhas pendentes e vencidas, mais antigas primeiro, sem as de `excludeIds`. */
    fetchDue: (excludeIds: readonly string[]) => Promise<R[]>;
    /** Acerta as visitas; devolve as que FALHARAM. */
    reconcile: (itemIds: readonly string[]) => Promise<Set<string>>;
  },
  opts: { batchSize?: number; maxPasses?: number } = {},
): Promise<DueBatch<R>> {
  const size = opts.batchSize ?? DUE_BATCH_SIZE;
  const maxPasses = opts.maxPasses ?? DUE_MAX_PASSES;
  const attempted = new Set<string>();
  const unreconciled = new Set<string>();
  const seen = new Set<string>();
  const batch: R[] = [];
  let deferred = 0;

  for (let pass = 0; pass < maxPasses && batch.length < size; pass++) {
    let rows = await deps.fetchDue([...seen]);
    if (rows.length === 0) break;

    // Confirmar a visita de cada lembrete que vai sair, mesmo que o acerto em
    // bloco anterior nao o tenha apanhado; depois voltar a ler o que sobra.
    const fresh = [...new Set(rows.map((r) => r.schedule_item_id).filter((id): id is string => !!id))]
      .filter((id) => !attempted.has(id));
    if (fresh.length > 0) {
      fresh.forEach((id) => attempted.add(id));
      const failed = await deps.reconcile(fresh);
      failed.forEach((id) => unreconciled.add(id));
      rows = await deps.fetchDue([...seen]);
    }

    for (const r of rows) {
      seen.add(r.id);
      if (isHeldBack(r, unreconciled)) deferred++;
      else batch.push(r);
    }
    if (rows.length < size) break;
  }

  return { rows: batch.slice(0, size), unreconciled, deferred };
}
