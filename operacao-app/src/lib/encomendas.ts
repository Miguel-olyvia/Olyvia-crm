/**
 * Distância ao armazém, encomendas na data certa e dados em falta
 * (db/dados-encomendas.sql). A parte pura está em domain/encomendas.ts.
 *
 * Antes de o SQL correr na base, as funções não existem: aí estas leituras
 * devolvem "nada" (sem distância, sem encomendas, sem dados em falta) em vez
 * de partirem o ecrã da obra. Qualquer outro erro sobe.
 */

import { supabase } from "./supabase";
import { ErroDeDados } from "./dados";
import type { DadoEmFalta, DistanciaArmazem, LinhaEncomenda } from "../domain/encomendas";

export type { DadoEmFalta, DistanciaArmazem, EstadoEncomenda, LinhaEncomenda } from "../domain/encomendas";

/** A função ainda não existe na base (SQL desta versão por correr). */
function semFuncao(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return /PGRST202|42883|does not exist|Could not find the function/i.test(`${error.message ?? ""} ${error.code ?? ""}`);
}

function rebentar(contexto: string, error: { message: string } | null): void {
  if (!error) return;
  // eslint-disable-next-line no-console
  console.error(`[Encomendas] ${contexto}:`, error);
  throw new ErroDeDados(`Não foi possível ${contexto}.`);
}

/** Do armazém mais próximo até à obra. null se não se souber. */
export async function distanciaDaObra(obraId: string): Promise<DistanciaArmazem | null> {
  const { data, error } = await supabase.rpc("rpc_ops_obra_distancia", { p_obra_id: obraId });
  if (semFuncao(error)) return null;
  rebentar("calcular a distância ao armazém", error);
  const x = (data ?? {}) as Partial<DistanciaArmazem>;
  return x.armazem && x.km_ida_volta !== undefined ? (x as DistanciaArmazem) : null;
}

/** O que há a encomendar (de uma obra, ou de todas as que vejo). */
export async function encomendas(orgId: string, obraId?: string): Promise<LinhaEncomenda[]> {
  const { data, error } = await supabase.rpc("rpc_ops_obra_encomendas", {
    p_org: orgId,
    p_obra_id: obraId ?? null,
  });
  if (semFuncao(error)) return [];
  rebentar("carregar as encomendas", error);
  return ((data ?? []) as unknown as LinhaEncomenda[]).map((l) => ({
    ...l,
    quantidade: l.quantidade === null ? null : Number(l.quantidade),
  }));
}

/** O que falta e piora o plano da obra, pior primeiro. */
export async function dadosEmFalta(obraId: string): Promise<DadoEmFalta[]> {
  const { data, error } = await supabase.rpc("rpc_ops_obra_dados_em_falta", { p_obra_id: obraId });
  if (semFuncao(error)) return [];
  rebentar("ver os dados em falta da obra", error);
  return ((data ?? []) as unknown as DadoEmFalta[]).sort((a, b) => a.gravidade - b.gravidade);
}
