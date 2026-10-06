/**
 * O que cada ação da fila faz quando chega à base.
 *
 * As ações das obras vão por `rpc_ops_obra_offline` (db/offline.sql): leva a
 * hora do telemóvel e o id da ação, para os tempos ficarem certos e nada se
 * aplicar duas vezes. Se essa RPC ainda não estiver instalada, cai nas de
 * sempre — funciona, mas com a hora do envio.
 */
import { supabase } from "../supabase";
import { responderMedicao, responderTarefa } from "../dados";
import { registarFotoTarefaNoCaminho } from "../obrasFotos";
import type { AcaoOffline } from "./fila";

const TIPO_OBRA: Record<string, "iniciar" | "pausar" | "concluir"> = {
  obra_iniciar: "iniciar",
  obra_pausar: "pausar",
  obra_concluir: "concluir",
};

function rpcEmFalta(e: { code?: string; message?: string } | null): boolean {
  if (!e) return false;
  return e.code === "PGRST202" || /could not find the function/i.test(e.message ?? "");
}

async function obra(a: AcaoOffline): Promise<unknown> {
  const tipo = TIPO_OBRA[a.tipo];
  const g = a.args as { tarefaId: string; motivo?: string | null; nota?: string | null; medidaReal?: number | null };
  const { data, error } = await supabase.rpc("rpc_ops_obra_offline", {
    p_acao_id: a.id,
    p_tipo: tipo,
    p_tarefa_id: g.tarefaId,
    p_quando: a.criadaEm,
    p_motivo: g.motivo ?? null,
    p_nota: g.nota ?? null,
    p_medida_real: g.medidaReal ?? null,
  });
  if (!error) return data;
  if (!rpcEmFalta(error)) throw new Error(error.message);

  // Sem db/offline.sql na base: as RPCs de sempre.
  const r =
    tipo === "iniciar"
      ? await supabase.rpc("rpc_ops_obra_iniciar_tarefa", { p_tarefa_id: g.tarefaId })
      : await supabase.rpc("rpc_ops_obra_terminar_tarefa", {
          p_tarefa_id: g.tarefaId,
          p_concluir: tipo === "concluir",
          p_motivo: g.motivo ?? null,
          p_nota: g.nota ?? null,
          ...(g.medidaReal != null ? { p_medida_real: g.medidaReal } : {}),
        });
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

export async function executarAcao(a: AcaoOffline): Promise<unknown> {
  switch (a.tipo) {
    case "obra_iniciar":
    case "obra_pausar":
    case "obra_concluir":
      return obra(a);
    case "ordem_responder":
      return responderTarefa(a.args as Parameters<typeof responderTarefa>[0]);
    case "ordem_medicao":
      return responderMedicao(a.args as Parameters<typeof responderMedicao>[0]);
    case "obra_foto": {
      if (!a.ficheiro) throw new Error("A foto guardada no telemóvel perdeu-se.");
      const g = a.args as { tarefaId: string; caminho: string; nome: string; mime: string | null; legenda?: string | null };
      return registarFotoTarefaNoCaminho({ ...g, ficheiro: a.ficheiro });
    }
    default:
      throw new Error(`Ação desconhecida: ${(a as AcaoOffline).tipo}`);
  }
}
