import { useQuery } from "@tanstack/react-query";
import { useSupplierPortal } from "@/contexts/SupplierPortalContext";
import { isNoSupplierAccess, spListOrders } from "@/lib/supplierPortal/spRpc";

/** Prefixo comum das queries de encomendas do portal (invalidar depois de confirmar). */
export const SP_ORDERS_QUERY_KEY = "supplier-portal-orders";

interface SpOrdersSummary {
  toConfirm: number;
  /** null enquanto a BD não devolver counts.sla_alert. */
  slaAlert: number | null;
  slaOverdue: number | null;
}

/**
 * Resumo de sp_list_orders(null,'to_confirm',null,1,0): total por confirmar +
 * counts.sla_alert/sla_overdue (estes não dependem do filtro). Partilhado pela
 * navegação, banner e página inicial (a mesma chave → um só pedido).
 */
function useSpOrdersSummary<T>(select: (s: SpOrdersSummary) => T) {
  const { account, active } = useSupplierPortal();
  const accountId = account?.id ?? null;
  return useQuery({
    queryKey: [SP_ORDERS_QUERY_KEY, accountId, "summary"],
    queryFn: async (): Promise<SpOrdersSummary> => {
      const res = await spListOrders({ status: "to_confirm", limit: 1, offset: 0 });
      return {
        toConfirm: res.total,
        slaAlert: res.counts.sla_alert ?? null,
        slaOverdue: res.counts.sla_overdue ?? null,
      };
    },
    select,
    enabled: !!accountId && active,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: (count, err) => !isNoSupplierAccess(err) && count < 1,
  });
}

const selectToConfirm = (s: SpOrdersSummary) => s.toConfirm;
const selectSla = (s: SpOrdersSummary) => ({ alert: s.slaAlert, overdue: s.slaOverdue });

/**
 * Número de encomendas por confirmar.
 * Em erro devolve null: o contador é acessório e não pode partir o layout.
 */
export function useSpOrdersToConfirm(): { count: number | null; isError: boolean } {
  const query = useSpOrdersSummary(selectToConfirm);
  return { count: query.data ?? null, isError: query.isError };
}

/**
 * Encomendas com alerta de prazo (SLA): em risco + ultrapassadas, em todo o
 * âmbito do fornecedor. alert null = desconhecido (erro ou BD ainda sem SLA).
 */
export function useSpOrdersSlaAlert(): { alert: number | null; overdue: number | null } {
  const query = useSpOrdersSummary(selectSla);
  return query.data ?? { alert: null, overdue: null };
}
