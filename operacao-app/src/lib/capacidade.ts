/**
 * Capacidade — uma RPC agregada (db/capacidade.sql). A base guarda o
 * resultado 6 horas em cache; `recalcular` força o cálculo.
 */

import { supabase } from "./supabase";
import { ErroDeDados } from "./dados";
import type { Capacidade } from "../domain/capacidade";

export async function capacidadeDaEquipa(
  orgId: string,
  { semanas = 12, recalcular = false }: { semanas?: number; recalcular?: boolean } = {}
): Promise<Capacidade> {
  const { data, error } = await supabase.rpc("rpc_ops_capacidade", {
    p_org: orgId,
    p_semanas: semanas,
    p_recalcular: recalcular,
  });
  if (error) {
    console.error("[Operações] calcular a capacidade:", error);
    if (/rpc_ops_capacidade/.test(error.message) && /(does not exist|not find|schema cache)/i.test(error.message)) {
      throw new ErroDeDados("A Capacidade ainda não está instalada nesta base (falta correr db/capacidade.sql).");
    }
    if (/gestor|permiss/i.test(error.message)) {
      throw new ErroDeDados("Só o gestor vê a capacidade da equipa.");
    }
    throw new ErroDeDados("Não foi possível calcular a capacidade.");
  }
  return data as unknown as Capacidade;
}
