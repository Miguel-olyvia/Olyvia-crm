import { Link, useLocation } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpOrdersSlaAlert } from "@/components/supplier-portal/useSpOrdersToConfirm";

/** Lista filtrada só pelas encomendas com prazo em risco/ultrapassado (SupplierPortalOrders, ?sla=alerta). */
export const SP_SLA_ALERT_ORDERS_HREF = "/supplier-portal/orders?estado=all&sla=alerta";

/** "N encomenda(s) em risco ou com prazo de entrega ultrapassado". */
export function spSlaAlertText(alert: number): string {
  return alert === 1
    ? "1 encomenda em risco ou com prazo de entrega ultrapassado"
    : `${alert.toLocaleString("pt-PT")} encomendas em risco ou com prazo de entrega ultrapassado`;
}

/**
 * Faixa global quando há encomendas com prazo (SLA) em risco ou ultrapassado.
 * Vermelha se houver alguma ultrapassada, âmbar se só em risco. Não aparece na
 * lista de encomendas (tem o filtro rápido) nem enquanto a BD não devolver o SLA.
 */
export function SpOrdersSlaBanner() {
  const location = useLocation();
  const { alert, overdue } = useSpOrdersSlaAlert();
  if (!alert || alert <= 0 || location.pathname === "/supplier-portal/orders") return null;

  const isOverdue = (overdue ?? 0) > 0;
  return (
    <div
      role="region"
      aria-label="Prazos de entrega"
      className={cn(
        "border-b px-4 py-2 md:px-6",
        isOverdue
          ? "border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100"
          : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100",
      )}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{spSlaAlertText(alert)}</span>
        </p>
        <Link
          to={SP_SLA_ALERT_ORDERS_HREF}
          className="inline-flex min-h-6 items-center gap-1 rounded text-sm font-medium underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ver encomendas
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
