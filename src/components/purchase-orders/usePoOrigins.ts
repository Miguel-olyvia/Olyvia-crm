// Origem / cliente das encomendas a fornecedor (extraído da lista de PurchaseOrders.tsx, que continua com a sua cópia):
// source_type='contract' + source_id → client_contracts. Se o contrato for sintético (is_manual_order) procura-se a
// Venda Direta ligada (direct_sales.sale_number → "VD-…"); senão é Encomenda Cliente manual (order_number "EC-…");
// contrato normal = "CC-…". Consultas .in(...) por lotes. Sem client_contracts.view a RLS não devolve o contrato e a
// PO fica sem origem conhecida; sem direct_sales.view cai-se no caso manual (silencioso, como na lista).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PoOriginInfo {
  originType: "contract" | "direct_sale" | "manual";
  number: string;
  clientName: string;
}

const CHUNK = 150;

function chunks<T>(list: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

interface ContractRow {
  id: string;
  contract_number: string | null;
  order_number: string | null;
  is_manual_order: boolean | null;
  anew_entities: { display_name: string | null } | null;
}

/** Origem por client_contracts.id. Lança o erro da leitura dos contratos (a dos vendas diretas é silenciosa). */
export async function fetchPoOrigins(contractIds: readonly string[]): Promise<Record<string, PoOriginInfo>> {
  const ids = Array.from(new Set(contractIds.filter(Boolean)));
  if (ids.length === 0) return {};
  const contractResults = await Promise.all(
    chunks(ids).map((part) =>
      supabase
        .from("client_contracts")
        .select("id, contract_number, order_number, is_manual_order, anew_entities(display_name)")
        .in("id", part),
    ),
  );
  const rows: ContractRow[] = [];
  for (const res of contractResults) {
    if (res.error) throw res.error;
    rows.push(...((res.data ?? []) as unknown as ContractRow[]));
  }

  const manualIds = rows.filter((r) => r.is_manual_order).map((r) => r.id);
  const saleByContract = new Map<string, string>();
  if (manualIds.length > 0) {
    const saleResults = await Promise.all(
      chunks(manualIds).map((part) =>
        supabase.from("direct_sales").select("client_contract_id, sale_number").in("client_contract_id", part).is("deleted_at", null),
      ),
    );
    for (const res of saleResults) {
      if (res.error) continue;
      for (const sale of (res.data ?? []) as { client_contract_id: string | null; sale_number: string | null }[]) {
        if (sale.client_contract_id && sale.sale_number && !saleByContract.has(sale.client_contract_id)) {
          saleByContract.set(sale.client_contract_id, sale.sale_number);
        }
      }
    }
  }

  const next: Record<string, PoOriginInfo> = {};
  for (const row of rows) {
    const clientName = row.anew_entities?.display_name || "";
    const contractNumber = row.contract_number || "";
    if (!row.is_manual_order) next[row.id] = { originType: "contract", number: contractNumber, clientName };
    else if (saleByContract.has(row.id)) next[row.id] = { originType: "direct_sale", number: saleByContract.get(row.id) as string, clientName };
    else next[row.id] = { originType: "manual", number: row.order_number || contractNumber, clientName };
  }
  return next;
}

/** Hook com react-query (chave pelos ids ordenados). Em erro devolve {} — nunca parte a lista. */
export function usePoOrigins(contractIds: readonly string[]) {
  const ids = Array.from(new Set(contractIds.filter(Boolean))).sort();
  return useQuery({
    queryKey: ["po-origins", ids],
    queryFn: async () => {
      try {
        return await fetchPoOrigins(ids);
      } catch {
        return {} as Record<string, PoOriginInfo>;
      }
    },
    enabled: ids.length > 0,
    staleTime: 60_000,
  });
}
