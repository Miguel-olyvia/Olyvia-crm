// O custo do stock (stocks.average_cost, stock_movements.unit_cost_at_time) já não se lê diretamente da tabela (migração
// 20270106070000: sem GRANT SELECT nessas colunas). Lê-se por duas RPCs que pedem products.view_cost na organização:
//   inv_valor_stock_armazens(p_org) -> valor (quantidade x custo médio) por armazém
//   inv_custos_movimentos(p_ids)    -> custo unitário de cada movimento (só os que a pessoa pode ver com custo)
import { supabase } from "@/integrations/supabase/client";

type Rpc = (nome: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
const rpc: Rpc = (nome, args) => (supabase as unknown as { rpc: Rpc }).rpc(nome, args);

/** Máximo de ids por pedido (a RPC recusa mais de 2000). */
export const CUSTOS_LOTE = 500;

/** Valor do stock por armazém (id do armazém -> euros). Lança o erro da base se faltar a permissão. */
export async function valorStockPorArmazem(organizationId: string): Promise<Record<string, number>> {
  const { data, error } = await rpc("inv_valor_stock_armazens", { p_org: organizationId });
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ warehouse_id: string; valor: number | string | null }>) {
    out[r.warehouse_id] = Number(r.valor) || 0;
  }
  return out;
}

/** Junta `unit_cost_at_time` às linhas pedidas (por id). As que a base não devolve ficam com custo null. */
export async function juntarCustosMovimentos<T extends { id: string }>(linhas: T[]): Promise<Array<T & { unit_cost_at_time: number | null }>> {
  const custos = new Map<string, number | null>();
  for (let i = 0; i < linhas.length; i += CUSTOS_LOTE) {
    const ids = linhas.slice(i, i + CUSTOS_LOTE).map((l) => l.id);
    const { data, error } = await rpc("inv_custos_movimentos", { p_ids: ids });
    if (error) throw error;
    for (const r of (data ?? []) as Array<{ id: string; unit_cost_at_time: number | string | null }>) {
      custos.set(r.id, r.unit_cost_at_time == null ? null : Number(r.unit_cost_at_time));
    }
  }
  return linhas.map((l) => ({ ...l, unit_cost_at_time: custos.get(l.id) ?? null }));
}
