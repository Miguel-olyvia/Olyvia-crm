// Importação de stock (Stocks.tsx › Importar): definições de uma linha que JÁ existe.
// O UPDATE direto em `stocks` pede inventory.edit (RLS) — com só inventory.import a linha era filtrada e nada ficava
// gravado. A RPC rpc_stock_import_settings (migração 20270109230000) aceita inventory.edit OU inventory.import na
// organização da linha e grava APENAS mínimo, máximo, ponto de encomenda e localização; a quantidade continua a entrar
// por rpc_adjust_stock (movimento de ajuste).
import { supabase } from "@/integrations/supabase/client";

type Rpc = (nome: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
const rpc: Rpc = (nome, args) => (supabase as unknown as { rpc: Rpc }).rpc(nome, args);

export interface DefinicoesStock {
  minimum_quantity: number;
  maximum_quantity: number;
  reorder_point: number;
  location: string | null;
}

/** Grava as definições de uma linha de stock existente. Devolve o erro da base (ou null). */
export async function gravarDefinicoesImportadas(
  stockId: string,
  definicoes: DefinicoesStock,
): Promise<{ message: string } | null> {
  const { error } = await rpc("rpc_stock_import_settings", {
    p_stock_id: stockId,
    p_minimum_quantity: definicoes.minimum_quantity,
    p_maximum_quantity: definicoes.maximum_quantity,
    p_reorder_point: definicoes.reorder_point,
    p_location: definicoes.location,
  });
  return error ?? null;
}
