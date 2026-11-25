import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";

// Transferências sugeridas para as Encomendas de Cliente (rpc_ec_transfer_suggestions):
// o motor reservou stock da EC num armazém que não é o mais próximo da morada da EC;
// a sugestão é transferir essa quantidade de → para. Só sugestão: a transferência
// continua manual (diálogo de movimento + rpc_register_stock_transfer).
//
// A RPC exige inventory.view (42501 sem ela) — tratado como "sem dados", em
// silêncio. Função ainda por aplicar (PGRST202 / 404) também. Outras falhas são
// reportadas (captureFlowError) e devolvem lista vazia: a secção fica escondida.
// Os tipos gerados não a conhecem ainda: chamada com cast local.

export interface EcTransferSuggestion {
  contract_id: string;
  order_number: string;
  client_name: string | null;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  from_warehouse_id: string;
  from_warehouse_name: string;
  to_warehouse_id: string;
  to_warehouse_name: string;
  /** Unidades de stock (pode ter decimais). */
  qty: number;
  /** Distância da morada da EC ao armazém de destino. */
  distance_km: number | null;
}

export interface EcTransferSuggestionGroup {
  contract_id: string;
  order_number: string;
  client_name: string | null;
  rows: EcTransferSuggestion[];
}

const STALE_TIME = 60 * 1000;

export const ecTransferSuggestionsQueryKey = (orgId: string | null | undefined) =>
  ["ec-transfer-suggestions", orgId ?? null] as const;

function isSilentError(error: unknown, status?: number): boolean {
  if (status === 404) return true;
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === "PGRST202" || code === "42501";
}

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function fetchEcTransferSuggestions(orgId: string): Promise<EcTransferSuggestion[]> {
  try {
    const { data, error, status } = await (supabase as any).rpc("rpc_ec_transfer_suggestions", {
      p_organization_id: orgId,
    });
    if (error) {
      if (isSilentError(error, status)) return [];
      throw error;
    }
    if (!Array.isArray(data)) return [];
    return data
      .map((r: any): EcTransferSuggestion => ({
        contract_id: r.contract_id,
        order_number: r.order_number,
        client_name: r.client_name ?? null,
        product_id: r.product_id,
        product_name: r.product_name,
        product_sku: r.product_sku ?? null,
        from_warehouse_id: r.from_warehouse_id,
        from_warehouse_name: r.from_warehouse_name,
        to_warehouse_id: r.to_warehouse_id,
        to_warehouse_name: r.to_warehouse_name,
        qty: toNum(r.qty) ?? 0,
        distance_km: toNum(r.distance_km),
      }))
      .filter((r: EcTransferSuggestion) => r.qty > 0);
  } catch (error) {
    captureFlowError(error, "ec-transfer-suggestions-load");
    return [];
  }
}

/** Agrupa por EC, mantendo a ordem em que a RPC as devolve (FIFO). */
export function groupEcTransferSuggestions(rows: EcTransferSuggestion[]): EcTransferSuggestionGroup[] {
  const groups = new Map<string, EcTransferSuggestionGroup>();
  for (const r of rows) {
    let g = groups.get(r.contract_id);
    if (!g) {
      g = { contract_id: r.contract_id, order_number: r.order_number, client_name: r.client_name, rows: [] };
      groups.set(r.contract_id, g);
    }
    g.rows.push(r);
  }
  return [...groups.values()];
}

/**
 * Transferências sugeridas da organização ativa. `enabled: false` não faz pedido.
 * `invalidate()` volta a pedir (chamar depois de registar uma transferência).
 */
export function useEcTransferSuggestions(options?: { enabled?: boolean }) {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();
  const orgId = activeCompany?.id ?? null;
  const enabled = (options?.enabled ?? true) && !!orgId;

  const query = useQuery({
    queryKey: ecTransferSuggestionsQueryKey(orgId),
    queryFn: () => fetchEcTransferSuggestions(orgId as string),
    enabled,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
    retry: false,
  });

  return {
    data: enabled ? (query.data ?? []) : [],
    isLoading: enabled && query.isLoading,
    invalidate: () => queryClient.invalidateQueries({ queryKey: ["ec-transfer-suggestions"] }),
  };
}
