import { supabase } from "./supabase";
import { fetchEffectiveStages, type EffectiveConfig } from "./ducConfig";
import type { TrackingEntry, DucVariant } from "./types";

/** Uma etapa ativa atribuída ao utilizador — uma linha da inbox "As minhas tarefas". */
export interface MyTask {
  ducId: string;
  ducNumber: string | null;
  clientName: string | null;
  organizationId: string;
  stageNo: number;
  stageTitle: string;
  /** Rótulo de função da etapa (schema), ex.: "Financeiro". */
  responsible: string;
  /** Início da etapa (fecho da anterior ou criação do DUC) — base do "há N dias". */
  enteredAt: string | null;
  status: string;
}

interface DucRow {
  id: string;
  duc_number: string | null;
  title: string | null;
  organization_id: string;
  variant: DucVariant;
  current_stage: number;
  status: string;
  tracking: TrackingEntry[] | null;
  created_at: string;
}

/**
 * Todas as etapas ATIVAS (a etapa em curso de cada DUC) atribuídas a este
 * utilizador, em todos os DUCs a que tem acesso — a sua fila de trabalho pessoal.
 *
 * A RLS já limita as linhas às organizações do utilizador; aqui filtramos pela
 * atribuição (`tracking[current_stage].assigned_to`). Resolve o título/função da
 * etapa a partir da configuração efetiva por (organização, variante), com cache.
 */
export async function fetchMyTasks(userId: string): Promise<MyTask[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("anew_client_ducs")
    .select(
      "id, duc_number, title, organization_id, variant, current_stage, status, tracking, created_at"
    )
    .is("deleted_at", null)
    .neq("status", "closed");
  if (error || !data) return [];

  const cache = new Map<string, EffectiveConfig>();
  const tasks: MyTask[] = [];

  for (const row of data as DucRow[]) {
    const tracking = (row.tracking ?? []) as TrackingEntry[];
    const entry = tracking.find((t) => t.stage === row.current_stage);
    // Só conta se a etapa ATUAL está atribuída a mim e ainda está por tratar.
    if (!entry || entry.assigned_to !== userId) continue;
    if (entry.state === "done" || entry.state === "skipped") continue;

    const cacheKey = `${row.organization_id}:${row.variant}`;
    let eff = cache.get(cacheKey);
    if (!eff) {
      eff = await fetchEffectiveStages(row.organization_id, row.variant);
      cache.set(cacheKey, eff);
    }
    const st = eff.stages.find((s) => s.no === row.current_stage);
    const enteredAt =
      (row.current_stage > 1
        ? tracking.find((t) => t.stage === row.current_stage - 1)?.date ?? null
        : null) ?? row.created_at;

    tasks.push({
      ducId: row.id,
      ducNumber: row.duc_number,
      clientName: row.title,
      organizationId: row.organization_id,
      stageNo: row.current_stage,
      stageTitle: st ? st.title.split(" — ")[0] : `Etapa ${row.current_stage}`,
      responsible: st?.responsible ?? "",
      enteredAt,
      status: row.status,
    });
  }

  // As que estão à espera há mais tempo primeiro (mais urgentes no topo).
  return tasks.sort(
    (a, b) => new Date(a.enteredAt ?? 0).getTime() - new Date(b.enteredAt ?? 0).getTime()
  );
}
