// Histórico da folha de uma Encomenda Cliente (secção "Histórico" do EcFolha
// do Olyvia 2.0), montado só com dados que já existem — sem tabela nova:
//   client_contract_events  criação, mudanças de estado e eliminação
//                           (RLS: client_contracts.view)
//   stock_movements         saídas e estornos desta encomenda
//                           (sale_source_type='contract'; RLS: inventory.view)
//   purchase_orders         pedidos ao fornecedor desta encomenda
//                           (source_type='contract'; RLS: purchase_orders.view)
// Cada fonte é best-effort: sem permissão ou com erro fica de fora e o
// histórico diz que está incompleto. Só leitura.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ClientOrderOrigin } from "./clientOrderFilters";

export interface ClientOrderEventRow {
  id: string;
  event_type: string | null;
  description: string | null;
  new_values: Record<string, unknown> | null;
  created_at: string | null;
}

export interface ClientOrderMovementRow {
  id: string;
  movement_type: string | null;
  quantity: number | string | null;
  reversal_of_movement_id: string | null;
  created_at: string | null;
  product_name: string | null;
  warehouse_name: string | null;
}

export interface ClientOrderPoRow {
  id: string;
  order_number: string | null;
  created_at: string | null;
}

export interface ClientOrderHistoryEntry {
  key: string;
  at: string;
  text: string;
}

const qty = (v: unknown): string => {
  const n = Math.abs(Number(v));
  return Number.isFinite(n) ? n.toLocaleString("pt-PT", { maximumFractionDigits: 3 }) : "?";
};

function eventText(e: ClientOrderEventRow, origin: ClientOrderOrigin): string | null {
  const status = typeof e.new_values?.status === "string" ? (e.new_values.status as string) : null;
  switch (e.event_type) {
    case "created":
      return origin === "manual" ? "Encomenda manual criada" : origin === "direct_sale" ? "Encomenda criada da venda direta" : "Contrato criado";
    case "status_changed":
      if (status === "signed" || status === "assinado") {
        return origin === "contract" ? "Contrato assinado: encomenda aberta" : origin === "direct_sale" ? "Venda direta confirmada: encomenda aberta" : "Encomenda aberta";
      }
      if (status === "pending_signature") return "Contrato enviado para assinatura";
      // A anulação tem evento próprio (contract_cancelled) com o motivo, quando
      // vem de "Eliminar"; a anulação do contrato só tem esta.
      if (status === "cancelled") return "Anulada";
      return e.description;
    case "contract_cancelled":
      return `Eliminada${e.description ? ` — ${e.description}` : ""}`;
    default:
      return e.description || e.event_type;
  }
}

/** Mais recente primeiro (como o 2.0: e.log ao contrário). */
export function buildClientOrderHistory(input: {
  origin: ClientOrderOrigin;
  events: readonly ClientOrderEventRow[];
  movements: readonly ClientOrderMovementRow[];
  purchaseOrders: readonly ClientOrderPoRow[];
}): ClientOrderHistoryEntry[] {
  const out: ClientOrderHistoryEntry[] = [];
  const hasDeleteEvent = input.events.some((e) => e.event_type === "contract_cancelled");
  for (const e of input.events) {
    if (!e.created_at) continue;
    // Eliminar escreve status_changed (→ cancelled) e contract_cancelled: um só.
    if (hasDeleteEvent && e.event_type === "status_changed" && e.new_values?.status === "cancelled") continue;
    const t = eventText(e, input.origin);
    if (t) out.push({ key: `ev:${e.id}`, at: e.created_at, text: t });
  }
  for (const m of input.movements) {
    if (!m.created_at) continue;
    const what = `${qty(m.quantity)} × ${m.product_name ?? "produto"}`;
    const where = m.warehouse_name ? ` (${m.warehouse_name})` : "";
    out.push({
      key: `mv:${m.id}`,
      at: m.created_at,
      text: m.reversal_of_movement_id
        ? `Estorno de saída: ${what} volta(m) ao stock${where}`
        : `Saída de stock: ${what}${where}`,
    });
  }
  for (const p of input.purchaseOrders) {
    if (!p.created_at) continue;
    out.push({ key: `po:${p.id}`, at: p.created_at, text: `Pedido ao fornecedor: ${p.order_number ?? "encomenda a fornecedor"}` });
  }
  return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export interface ClientOrderHistory {
  entries: ClientOrderHistoryEntry[];
  /** Alguma fonte não se conseguiu ler (permissão/erro). */
  partial: boolean;
}

export function useClientOrderHistory(
  organizationId: string | null | undefined,
  contractId: string | null | undefined,
  origin: ClientOrderOrigin,
  version: number,
) {
  return useQuery({
    queryKey: ["client-order-history", organizationId ?? null, contractId ?? null, origin, version],
    enabled: !!organizationId && !!contractId,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ClientOrderHistory> => {
      const sb = supabase as any;
      const [ev, mv, po] = await Promise.all([
        sb
          .from("client_contract_events")
          .select("id, event_type, description, new_values, created_at")
          .eq("contract_id", contractId)
          .order("created_at", { ascending: true }),
        sb
          .from("stock_movements")
          .select("id, movement_type, quantity, reversal_of_movement_id, created_at, products(name), warehouses(name)")
          .eq("organization_id", organizationId)
          .eq("sale_source_type", "contract")
          .eq("sale_source_id", contractId)
          .order("created_at", { ascending: true }),
        sb
          .from("purchase_orders")
          .select("id, order_number, created_at")
          .eq("organization_id", organizationId)
          .eq("source_type", "contract")
          .eq("source_id", contractId)
          .is("deleted_at", null)
          .order("created_at", { ascending: true }),
      ]);
      const name = (v: unknown): string | null => {
        const o = Array.isArray(v) ? v[0] : v;
        return o && typeof o === "object" && typeof (o as { name?: unknown }).name === "string" ? (o as { name: string }).name : null;
      };
      const movements: ClientOrderMovementRow[] = ((mv.error ? [] : mv.data) ?? []).map((m: Record<string, unknown>) => ({
        id: String(m.id),
        movement_type: (m.movement_type as string) ?? null,
        quantity: (m.quantity as number | string | null) ?? null,
        reversal_of_movement_id: (m.reversal_of_movement_id as string) ?? null,
        created_at: (m.created_at as string) ?? null,
        product_name: name(m.products),
        warehouse_name: name(m.warehouses),
      }));
      return {
        entries: buildClientOrderHistory({
          origin,
          events: (ev.error ? [] : ev.data) ?? [],
          movements,
          purchaseOrders: (po.error ? [] : po.data) ?? [],
        }),
        partial: !!(ev.error || mv.error || po.error),
      };
    },
  });
}
