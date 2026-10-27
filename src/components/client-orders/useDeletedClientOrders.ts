// "Ver eliminadas" da lista "Saídas para clientes": as encomendas eliminadas
// (rpc_delete_client_order) ou anuladas pelo contrato, lidas de
// client_contracts — rpc_list_client_order_documents só devolve as ativas.
//
// Só leitura e sem colunas novas: deleted_at / cancelled_at /
// cancellation_reason já existem. Passa pela RLS de client_contracts
// (client_contracts.view + organização no CRM); sem essa permissão a página
// desativa a opção (ver ClientOrders.tsx). Sem RPC própria: uma RPC de leitura
// com client_orders.view tiraria essa dependência (ver relatório).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mapDeletedContract, type DeletedClientOrderRow } from "./clientOrderFilters";

/** Teto de leitura: as eliminadas mais recentes. */
export const DELETED_CLIENT_ORDERS_LIMIT = 500;

export function useDeletedClientOrders(organizationId: string | null | undefined, enabled: boolean, version: number) {
  return useQuery({
    queryKey: ["client-orders-deleted", organizationId ?? null, version],
    enabled: enabled && !!organizationId,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<{ rows: DeletedClientOrderRow[]; truncated: boolean }> => {
      const { data, error } = await (supabase as any)
        .from("client_contracts")
        .select(
          "id, contract_number, order_number, is_manual_order, signature_date, deleted_at, cancelled_at, cancellation_reason, delivery_address, notes, total_value, entity:anew_entities!client_contracts_entity_id_fkey(display_name)",
        )
        .eq("organization_id", organizationId)
        // Só as que chegaram a ser encomenda (assinadas) e saíram da lista.
        .not("signature_date", "is", null)
        .or("deleted_at.not.is.null,status.eq.cancelled")
        .order("signature_date", { ascending: false })
        .limit(DELETED_CLIENT_ORDERS_LIMIT);
      if (error) throw error;
      const rows = ((data as Array<Record<string, unknown>> | null) ?? [])
        .map(mapDeletedContract)
        .filter((r): r is DeletedClientOrderRow => r !== null);
      return { rows, truncated: rows.length >= DELETED_CLIENT_ORDERS_LIMIT };
    },
  });
}
