import { useQuery } from "@tanstack/react-query";
import { useSupplierPortal } from "@/contexts/SupplierPortalContext";
import { isNoSupplierAccess, spListOrders } from "@/lib/supplierPortal/spRpc";

/** Prefixo comum das queries de encomendas do portal (invalidar depois de confirmar). */
export const SP_ORDERS_QUERY_KEY = "supplier-portal-orders";

/**
 * Número de encomendas por confirmar (sp_list_orders(null,'to_confirm',null,1,0).total).
 * Partilhado pela navegação e pela página inicial (a mesma chave → um só pedido).
 * Em erro devolve null: o contador é acessório e não pode partir o layout.
 */
export function useSpOrdersToConfirm(): { count: number | null; isError: boolean } {
  const { account, active } = useSupplierPortal();
  const accountId = account?.id ?? null;
  const query = useQuery({
    queryKey: [SP_ORDERS_QUERY_KEY, accountId, "to-confirm-count"],
    queryFn: async () => (await spListOrders({ status: "to_confirm", limit: 1, offset: 0 })).total,
    enabled: !!accountId && active,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: (count, err) => !isNoSupplierAccess(err) && count < 1,
  });
  return { count: query.data ?? null, isError: query.isError };
}
