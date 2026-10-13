/**
 * Checklist de arranque da obra (db/obra-arranque.sql). Sem esse SQL
 * instalado, `obterArranque` devolve null e o separador diz "por instalar" —
 * a obra funciona na mesma.
 */
import { supabase } from "./supabase";
import { ErroDeDados, ErroDeEscrita } from "./dados";
import type { Arranque } from "../domain/arranque";

export type { Arranque } from "../domain/arranque";

function rpcEmFalta(error: { message: string; code?: string } | null): boolean {
  return (
    !!error &&
    (error.code === "PGRST202" ||
      error.code === "42883" ||
      /rpc_ops_obra_arranque|rpc_ops_obra_aprovar_plano|function .* does not exist/i.test(error.message))
  );
}

export async function obterArranque(obraId: string): Promise<Arranque | null> {
  const { data, error } = await supabase.rpc("rpc_ops_obra_arranque", {
    p_obra_id: obraId,
  });
  if (error) {
    if (rpcEmFalta(error)) return null;
    // eslint-disable-next-line no-console
    console.error("[Obras] arranque:", error);
    throw new ErroDeDados("Não foi possível carregar o checklist de arranque.");
  }
  return (data as unknown as Arranque) ?? null;
}

export interface RespostaAprovarPlano {
  ok: boolean;
  aprovado_em: string;
  aprovado_por: string;
  avisos: string[];
  pode_arrancar: boolean;
  falta: string[];
}

export async function aprovarPlano(obraId: string): Promise<RespostaAprovarPlano> {
  const { data, error } = await supabase.rpc("rpc_ops_obra_aprovar_plano", {
    p_obra_id: obraId,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível aprovar o plano.");
  return data as unknown as RespostaAprovarPlano;
}

export async function sincronizarMaterial(obraId: string): Promise<{ ok: boolean; tarefas: number }> {
  const { data, error } = await supabase.rpc("rpc_ops_obra_material_sincronizar", { p_obra_id: obraId });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível atualizar as datas do material.");
  return data as unknown as { ok: boolean; tarefas: number };
}
