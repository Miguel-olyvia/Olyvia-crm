// Encomendas de cliente: que encomendas o utilizador pode eliminar.
// rpc_delete_client_order recusa fora do âmbito (organização + ORG/TEAM/OWNED de client_orders.delete); o ecrã só
// perguntava hasPermission e mostrava «Eliminar» em encomendas que o servidor recusa. rpc_client_orders_can_delete
// (migração 20270109240000) faz as mesmas verificações de permissão/âmbito e devolve os ids que passam.
import { supabase } from "@/integrations/supabase/client";

type Rpc = (nome: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
const rpc: Rpc = (nome, args) => (supabase as unknown as { rpc: Rpc }).rpc(nome, args);

/** Máximo de ids por pedido (a RPC recusa mais de 1000). */
export const PODE_APAGAR_LOTE = 500;

/**
 * Dos ids pedidos, os que o utilizador pode eliminar. Em caso de erro devolve um conjunto vazio (o botão fica
 * escondido — o servidor recusaria na mesma) e regista o erro na consola.
 */
export async function encomendasQuePodeApagar(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  for (let i = 0; i < unicos.length; i += PODE_APAGAR_LOTE) {
    const lote = unicos.slice(i, i + PODE_APAGAR_LOTE);
    const { data, error } = await rpc("rpc_client_orders_can_delete", { p_contract_ids: lote });
    if (error) {
      console.error("[encomendasQuePodeApagar] rpc_client_orders_can_delete falhou:", error);
      return new Set<string>();
    }
    for (const id of (data ?? []) as string[]) out.add(id);
  }
  return out;
}
