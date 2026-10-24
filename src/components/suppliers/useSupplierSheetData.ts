// Leituras da ficha do fornecedor (folha lateral de Compras › Fornecedor).
// Só leituras — a escrita continua nas RPCs/formulários já existentes.
//
//   useSupplierItems(id, canViewPricing) → item_suppliers do fornecedor (o mesmo
//       pedido do antigo diálogo "Catálogo"): com suppliers.view_pricing lê
//       item_suppliers; sem ela lê item_suppliers_public (sem preço/código).
//   useSupplierSlaSummary(id, enabled)   → rpc_get_supplier_sla_report(p_supplier_id).
//   useSupplierPurchaseOrders(org, id)   → POs abertas (ordered | partially_received,
//       a mesma regra da coluna "POs abertas" da lista) e as últimas 6.
//   useSupplierPortalInvite(id, enabled) → rpc_supplier_portal_status: o utilizador
//       convidado mais recente (email e data do convite) para a faixa da ficha.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { callRpc, type PortalUser, type SupplierPortalStatus } from "@/components/supplier-portal-crm/types";

export interface SupplierItemRow {
  id: string;
  item_type: string;
  supplier_sku: string | null;
  purchase_price: number | null;
  currency: string;
  lead_time_days: number | null;
  is_preferred: boolean;
  is_active: boolean;
  products?: { name: string; sku: string } | null;
  services?: { name: string; sku: string } | null;
}

export const supplierItemsKey = (supplierId: string) => ["supplier-sheet-items", supplierId] as const;

async function loadItems(supplierId: string, canViewPricing: boolean): Promise<SupplierItemRow[]> {
  // item_suppliers / item_suppliers_public com embeds: fora dos tipos gerados (como no diálogo antigo).
  const client = supabase as unknown as { from: (t: string) => any };
  const { data, error } = canViewPricing
    ? await client
        .from("item_suppliers")
        .select("id, item_type, supplier_sku, purchase_price, currency, lead_time_days, is_preferred, is_active, products(name, sku), services(name, sku)")
        .eq("supplier_id", supplierId)
        .is("deleted_at", null)
        .order("item_type")
    : await client
        .from("item_suppliers_public")
        .select("id, item_type, lead_time_days, is_preferred, is_active, products(name, sku), services(name, sku)")
        .eq("supplier_id", supplierId)
        .order("item_type");
  if (error) throw error;
  const rows = (data ?? []) as SupplierItemRow[];
  return canViewPricing ? rows : rows.map((r) => ({ ...r, supplier_sku: null, purchase_price: null, currency: "" }));
}

export function useSupplierItems(supplierId: string | null, canViewPricing: boolean, enabled = true) {
  return useQuery({
    queryKey: [...supplierItemsKey(supplierId ?? ""), canViewPricing],
    queryFn: () => loadItems(supplierId as string, canViewPricing),
    enabled: !!supplierId && enabled,
    staleTime: 30 * 1000,
  });
}

export interface SupplierSlaSummary {
  total_received: number;
  within_sla: number | null;
  over_sla: number | null;
  avg_delay_days: number | null;
  compliance_pct: number | null;
}

export function useSupplierSlaSummary(supplierId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["supplier-sheet-sla", supplierId],
    queryFn: async (): Promise<SupplierSlaSummary | null> => {
      const { data, error } = await supabase.rpc("rpc_get_supplier_sla_report", { p_supplier_id: supplierId as string });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as SupplierSlaSummary | undefined) ?? null;
    },
    enabled: !!supplierId && enabled,
    staleTime: 60 * 1000,
  });
}

export interface SupplierPoRow {
  id: string;
  order_number: string;
  order_date: string;
  expected_delivery: string | null;
  status: string;
  total_value: number;
}

const OPEN_PO_STATUSES = ["ordered", "partially_received"];
const PO_COLUMNS = "id, order_number, order_date, expected_delivery, status, total_value";

// activeOrganizationId = organização ATIVA (activeCompany.id), como a lista de
// Encomendas a fornecedor — nunca a organização do fornecedor. Sem organização
// ativa não lê (nada de consultas sem filtro de organização).
export function useSupplierPurchaseOrders(activeOrganizationId: string | null, supplierId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["supplier-sheet-pos", activeOrganizationId, supplierId],
    queryFn: async (): Promise<{ open: SupplierPoRow[]; recent: SupplierPoRow[] }> => {
      const orgId = activeOrganizationId as string;
      const openQ = supabase
        .from("purchase_orders")
        .select(PO_COLUMNS)
        .eq("organization_id", orgId)
        .eq("supplier_id", supplierId as string)
        .in("status", OPEN_PO_STATUSES)
        .is("deleted_at", null)
        .order("order_date", { ascending: false })
        .order("id", { ascending: false });
      const recentQ = supabase
        .from("purchase_orders")
        .select(PO_COLUMNS)
        .eq("organization_id", orgId)
        .eq("supplier_id", supplierId as string)
        .is("deleted_at", null)
        .order("order_date", { ascending: false })
        .order("id", { ascending: false })
        .limit(6);
      const [openRes, recentRes] = await Promise.all([openQ, recentQ]);
      if (openRes.error) throw openRes.error;
      if (recentRes.error) throw recentRes.error;
      return { open: (openRes.data ?? []) as SupplierPoRow[], recent: (recentRes.data ?? []) as SupplierPoRow[] };
    },
    enabled: !!activeOrganizationId && !!supplierId && enabled,
    staleTime: 60 * 1000,
  });
}

export const supplierPortalInviteKey = (supplierId: string | null) => ["supplier-sheet-portal-invite", supplierId] as const;

export interface SupplierPortalInvite {
  status: SupplierPortalStatus;
  /** Utilizador ativo convidado mais recentemente (quem recebe o "Reenviar convite"). */
  user: PortalUser | null;
}

export function useSupplierPortalInvite(supplierId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: supplierPortalInviteKey(supplierId),
    queryFn: async (): Promise<SupplierPortalInvite> => {
      const { data, error } = await callRpc<SupplierPortalStatus>("rpc_supplier_portal_status", { p_supplier_id: supplierId as string });
      if (error || !data) throw new Error(error?.message || "Não foi possível carregar o estado do portal.");
      const active = data.users
        .filter((u) => u.access_status === "active")
        .sort((a, b) => Date.parse(b.granted_at ?? "") - Date.parse(a.granted_at ?? "") || 0);
      return { status: data, user: active[0] ?? null };
    },
    enabled: !!supplierId && enabled,
    staleTime: 30 * 1000,
  });
}
