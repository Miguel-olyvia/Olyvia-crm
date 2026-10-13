// Os quatro cartões das Encomendas a fornecedor (kpis do protótipo, EncomendasInv.tsx):
// Por aprovar · Encomendadas (+ parcialmente recebidas) · Atrasadas · Valor por receber.
//
// Leitura própria, independente da lista (que pode estar a mostrar só eliminadas):
//   1. purchase_orders não eliminadas em pending/ordered/partially_received
//      (id, status, expected_delivery) da organização ativa;
//   2. só com products.view_cost: purchase_order_items das POs em aberto
//      (ordered/partially_received), filtradas pela organização através do
//      embed purchase_orders!inner. Valor por receber = total_price (com IVA)
//      × (quantity − received_quantity) / quantity. "Não vou receber o resto"
//      já baixa quantity para o recebido, por isso a parte anulada não conta.
// Volta a ler sempre que reloadSignal muda (a lista recarregou). Em erro fica
// sem números ("—") e nunca parte a página.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { KpiGrid, KpiTile, type PoStatusFilter } from "@/components/inventory/ui";
import { PO_OPEN_STATUSES, formatEur, isPoLate, todayIsoLocal } from "./poListUtils";

export const PO_VALUE_PERMISSION = "products.view_cost";

const PAGE = 1000;

interface PoKpiCounts {
  pending: number;
  ordered: number;
  partial: number;
  late: number;
  /** null = sem permissão ou leitura falhou. */
  openValue: number | null;
}

async function fetchPaged<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return rows;
}

export function usePoKpis(organizationId: string | null | undefined, reloadSignal: unknown, canSeeValue: boolean) {
  const [counts, setCounts] = useState<PoKpiCounts | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;
    if (!organizationId) {
      setCounts(null);
      return;
    }
    (async () => {
      const orders = await fetchPaged<{ id: string; status: string; expected_delivery: string | null }>((from, to) =>
        supabase
          .from("purchase_orders")
          .select("id, status, expected_delivery")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .in("status", ["pending", ...PO_OPEN_STATUSES])
          .order("id")
          .range(from, to),
      );
      const today = todayIsoLocal();
      const next: PoKpiCounts = {
        pending: orders.filter((o) => o.status === "pending").length,
        ordered: orders.filter((o) => o.status === "ordered").length,
        partial: orders.filter((o) => o.status === "partially_received").length,
        late: orders.filter((o) => isPoLate(o, today)).length,
        openValue: null,
      };
      if (canSeeValue) {
        try {
          const items = await fetchPaged<{ quantity: number | null; received_quantity: number | null; total_price: number | null }>(
            (from, to) =>
              supabase
                .from("purchase_order_items")
                .select("id, quantity, received_quantity, total_price, purchase_orders!inner(organization_id, status, deleted_at)")
                .eq("purchase_orders.organization_id", organizationId)
                .is("purchase_orders.deleted_at", null)
                .in("purchase_orders.status", [...PO_OPEN_STATUSES])
                .order("id")
                .range(from, to) as unknown as PromiseLike<{
                data: { quantity: number | null; received_quantity: number | null; total_price: number | null }[] | null;
                error: unknown;
              }>,
          );
          next.openValue = items.reduce((sum, it) => {
            const qty = Number(it.quantity) || 0;
            if (qty <= 0) return sum;
            const remaining = Math.max(0, qty - (Number(it.received_quantity) || 0));
            return sum + ((Number(it.total_price) || 0) * remaining) / qty;
          }, 0);
        } catch (error) {
          console.error("Error loading purchase order open value:", error);
        }
      }
      if (requestId === requestRef.current) setCounts(next);
    })().catch((error) => {
      console.error("Error loading purchase order KPIs:", error);
      if (requestId === requestRef.current) setCounts(null);
    });
  }, [organizationId, reloadSignal, canSeeValue]);

  return counts;
}

interface PoKpisProps {
  organizationId: string | null | undefined;
  /** Muda quando a lista recarrega (ex.: o array de encomendas). */
  reloadSignal: unknown;
  activeStatus: PoStatusFilter;
  onFilter: (status: PoStatusFilter) => void;
}

export function PoKpis({ organizationId, reloadSignal, activeStatus, onFilter }: PoKpisProps) {
  const { hasPermission, loading } = usePermissions();
  const canSeeValue = !loading && hasPermission(PO_VALUE_PERMISSION);
  const c = usePoKpis(organizationId, reloadSignal, canSeeValue);
  const n = (v: number | undefined) => (c ? String(v ?? 0) : "—");

  return (
    <KpiGrid>
      <KpiTile
        tone="warn"
        label="Por aprovar"
        value={n(c?.pending)}
        hint="pending → ordered"
        onClick={() => onFilter("pending")}
        actionLabel="Filtrar por pendentes"
        active={activeStatus === "pending"}
      />
      {/* O número é só "ordered" (o mesmo que o clique filtra); as parcialmente
          recebidas têm o seu próprio botão por baixo, com o filtro respetivo.
          O hint " " reserva a linha onde o botão (irmão, não aninhado) fica. */}
      <div className="relative grid">
        <KpiTile
          tone="info"
          label="Encomendadas"
          value={n(c?.ordered)}
          hint={" "}
          onClick={() => onFilter("ordered")}
          actionLabel="Filtrar por encomendadas"
          active={activeStatus === "ordered"}
        />
        <button
          type="button"
          onClick={() => onFilter("partially_received")}
          aria-pressed={activeStatus === "partially_received"}
          className={`absolute bottom-3 left-4 rounded-sm py-1 text-left text-xs hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            activeStatus === "partially_received" ? "font-semibold text-foreground underline" : "text-muted-foreground"
          }`}
        >
          {c ? c.partial : "—"} parcialmente recebidas
          <span className="sr-only">. Filtrar por parcialmente recebidas</span>
        </button>
      </div>
      <KpiTile
        tone="bad"
        label="Atrasadas"
        value={n(c?.late)}
        hint="entrega prevista ultrapassada"
        onClick={() => onFilter("late")}
        actionLabel="Filtrar por atrasadas"
        active={activeStatus === "late"}
      />
      <KpiTile
        label="Valor por receber"
        value={canSeeValue && c?.openValue != null ? formatEur(c.openValue) : "—"}
        hint={canSeeValue ? "com IVA, só o que falta" : `Sem permissão: requer ${PO_VALUE_PERMISSION}.`}
      />
    </KpiGrid>
  );
}
