// Leituras da ficha do fornecedor (folha lateral de Compras › Fornecedor).
// Só leituras — a escrita continua nas RPCs/formulários já existentes.
//
//   useSupplierItems(id, canViewPricing) → item_suppliers do fornecedor em páginas
//       de 50 (ordem item_type, id) com as 2 seguintes pré-carregadas: com
//       suppliers.view_pricing lê item_suppliers; sem ela lê item_suppliers_public
//       (sem preço/código). Nome/SKU vêm à parte, só para os ids da página.
//   useSupplierSlaSummary(id, enabled)   → rpc_get_supplier_sla_report(p_supplier_id).
//   useSupplierPurchaseOrders(org, id)   → POs abertas (ordered | partially_received,
//       a mesma regra da coluna "POs abertas" da lista) e as últimas 6.
//   useSupplierPortalInvite(id, enabled) → rpc_supplier_portal_status: o utilizador
//       convidado mais recente (email e data do convite) para a faixa da ficha.
import { useCallback, useEffect, useMemo } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { poVista, PO_VISTA_ENCOMENDAS } from "@/components/purchase-orders/poVistas";
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

/** Prefixo de todas as leituras de artigos do fornecedor: invalidar isto refaz a lista paginada e as páginas em cache. */
export const supplierItemsKey = (supplierId: string) => ["supplier-sheet-items", supplierId] as const;

/** Artigos por página e quantas páginas seguintes se pré-carregam assim que a atual chega. */
export const SUPPLIER_ITEMS_PAGE_SIZE = 50;
export const SUPPLIER_ITEMS_PREFETCH_PAGES = 2;
const SUPPLIER_ITEMS_STALE_MS = 30 * 1000;

/**
 * Onde começa uma página: ordem (item_type, id) — primeiro os produtos, depois os serviços, cada
 * grupo por id. Paginação por cursor (id > último) em vez de .range(): com OFFSET a base tinha de
 * passar a RLS em todas as linhas do fornecedor antes de ordenar (13 770 no ANLORBEL → 6–11 s);
 * com o cursor percorre o índice da chave primária e pára às 50 (~0,1 s em qualquer página).
 */
export interface SupplierItemsCursor {
  type: "product" | "service";
  /** id do último artigo já mostrado deste tipo; null = do início do tipo. */
  after: string | null;
}
export const SUPPLIER_ITEMS_FIRST_CURSOR: SupplierItemsCursor = { type: "product", after: null };

export const supplierItemsPageKey = (supplierId: string, canViewPricing: boolean, cursor: SupplierItemsCursor) =>
  [...supplierItemsKey(supplierId), canViewPricing, "page", cursor.type, cursor.after ?? ""] as const;
const supplierItemsListKey = (supplierId: string, canViewPricing: boolean) =>
  [...supplierItemsKey(supplierId), canViewPricing, "list"] as const;

export interface SupplierItemsPage {
  rows: SupplierItemRow[];
  /** Cursor da página seguinte; null = fim da lista. */
  next: SupplierItemsCursor | null;
}

interface RawItemRow {
  id: string;
  item_type: string;
  product_id: string | null;
  service_id: string | null;
  supplier_sku?: string | null;
  purchase_price?: number | null;
  currency?: string | null;
  lead_time_days: number | null;
  is_preferred: boolean;
  is_active: boolean;
}

// item_suppliers / item_suppliers_public ficam fora dos tipos gerados (como no diálogo antigo).
const untyped = () => supabase as unknown as { from: (t: string) => any };

const PRICING_COLUMNS =
  "id, item_type, product_id, service_id, supplier_sku, purchase_price, currency, lead_time_days, is_preferred, is_active";
const PUBLIC_COLUMNS = "id, item_type, product_id, service_id, lead_time_days, is_preferred, is_active";

/** Até `limit` associações de um tipo, por id, depois de `after`. */
async function loadItemsOfType(
  supplierId: string,
  canViewPricing: boolean,
  type: SupplierItemsCursor["type"],
  after: string | null,
  limit: number,
): Promise<RawItemRow[]> {
  // Com suppliers.view_pricing lê item_suppliers; sem ela lê item_suppliers_public (sem preço/código).
  let q = canViewPricing
    ? untyped().from("item_suppliers").select(PRICING_COLUMNS).eq("supplier_id", supplierId).is("deleted_at", null)
    : untyped().from("item_suppliers_public").select(PUBLIC_COLUMNS).eq("supplier_id", supplierId);
  q = q.eq("item_type", type);
  if (after) q = q.gt("id", after);
  const { data, error } = await q.order("id").limit(limit);
  if (error) throw error;
  return (data ?? []) as RawItemRow[];
}

/**
 * Nome/SKU só dos artigos da página. Não se usam embeds products(...)/services(...): o PostgREST
 * junta-os às tabelas inteiras (32k produtos, RLS por linha) e o pedido passava os 8 s do
 * statement_timeout. Aqui são pedidos por chave primária com no máximo 50 ids.
 */
async function loadNames(table: "products" | "services", ids: string[]): Promise<Map<string, { name: string; sku: string }>> {
  const map = new Map<string, { name: string; sku: string }>();
  if (ids.length === 0) return map;
  const { data, error } = await untyped().from(table).select("id, name, sku").in("id", ids);
  if (error) throw error;
  for (const r of (data ?? []) as { id: string; name: string; sku: string }[]) map.set(r.id, { name: r.name, sku: r.sku });
  return map;
}

/** Uma página (até 50) a partir de `cursor`: acaba os produtos e, se sobrar espaço, começa os serviços. */
export async function fetchSupplierItemsPage(
  supplierId: string,
  canViewPricing: boolean,
  cursor: SupplierItemsCursor,
): Promise<SupplierItemsPage> {
  const size = SUPPLIER_ITEMS_PAGE_SIZE;
  let raw = await loadItemsOfType(supplierId, canViewPricing, cursor.type, cursor.after, size);
  if (cursor.type === "product" && raw.length < size) {
    raw = raw.concat(await loadItemsOfType(supplierId, canViewPricing, "service", null, size - raw.length));
  }

  const productIds = [...new Set(raw.filter((r) => r.item_type === "product" && r.product_id).map((r) => r.product_id as string))];
  const serviceIds = [...new Set(raw.filter((r) => r.item_type === "service" && r.service_id).map((r) => r.service_id as string))];
  const [products, services] = await Promise.all([loadNames("products", productIds), loadNames("services", serviceIds)]);

  const rows: SupplierItemRow[] = raw.map((r) => ({
    id: r.id,
    item_type: r.item_type,
    supplier_sku: canViewPricing ? r.supplier_sku ?? null : null,
    purchase_price: canViewPricing ? r.purchase_price ?? null : null,
    currency: canViewPricing ? r.currency ?? "" : "",
    lead_time_days: r.lead_time_days,
    is_preferred: r.is_preferred,
    is_active: r.is_active,
    products: r.product_id ? products.get(r.product_id) ?? null : null,
    services: r.service_id ? services.get(r.service_id) ?? null : null,
  }));
  // Página cheia: pode haver mais (no pior caso a seguinte vem vazia e a lista acaba aí).
  const last = raw[raw.length - 1];
  const next: SupplierItemsCursor | null =
    raw.length === size && last ? { type: last.item_type === "service" ? "service" : "product", after: last.id } : null;
  return { rows, next };
}

/**
 * Artigos do fornecedor em páginas de 50 («Carregar mais»). Cada página vive na sua própria
 * entrada de cache (supplierItemsPageKey); a lista lê-as com fetchQuery, por isso as 2 páginas
 * seguintes, pré-carregadas assim que a atual chega, aparecem logo ao carregar mais.
 */
export function useSupplierItems(supplierId: string | null, canViewPricing: boolean, enabled = true) {
  const queryClient = useQueryClient();
  const sid = supplierId ?? "";
  const fetchPage = useCallback(
    (cursor: SupplierItemsCursor) =>
      queryClient.fetchQuery({
        queryKey: supplierItemsPageKey(sid, canViewPricing, cursor),
        queryFn: () => fetchSupplierItemsPage(sid, canViewPricing, cursor),
        staleTime: SUPPLIER_ITEMS_STALE_MS,
      }),
    [queryClient, sid, canViewPricing],
  );

  const query = useInfiniteQuery({
    queryKey: supplierItemsListKey(sid, canViewPricing),
    initialPageParam: SUPPLIER_ITEMS_FIRST_CURSOR,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    enabled: !!supplierId && enabled,
    staleTime: SUPPLIER_ITEMS_STALE_MS,
  });

  const pages = query.data?.pages;
  const rows = useMemo(() => pages?.flatMap((p) => p.rows) ?? [], [pages]);
  const nextCursor = pages?.[pages.length - 1]?.next ?? null;
  const nextType = nextCursor?.type;
  const nextAfter = nextCursor?.after ?? null;

  // Pré-carregar as 2 páginas seguintes quando chega uma página cheia (só entram na lista com «Carregar mais»).
  // Com cursor, cada página depende da anterior, por isso vão em cadeia.
  useEffect(() => {
    if (!supplierId || !nextType) return;
    let cancelled = false;
    void (async () => {
      let cursor: SupplierItemsCursor | null = { type: nextType, after: nextAfter };
      for (let k = 0; k < SUPPLIER_ITEMS_PREFETCH_PAGES && cursor && !cancelled; k++) {
        const at: SupplierItemsCursor = cursor;
        try {
          const page: SupplierItemsPage = await queryClient.fetchQuery({
            queryKey: supplierItemsPageKey(supplierId, canViewPricing, at),
            queryFn: () => fetchSupplierItemsPage(supplierId, canViewPricing, at),
            staleTime: SUPPLIER_ITEMS_STALE_MS,
          });
          cursor = page.next;
        } catch {
          return; // o pré-carregamento é só uma ajuda: o erro aparece se o utilizador pedir a página
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryClient, supplierId, canViewPricing, nextType, nextAfter]);

  return { ...query, rows };
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
  /** NULL sem products.view_cost (vista po_v_purchase_orders, 20270112850000). */
  total_value: number | null;
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
      // Pela vista: a tabela já não dá total_value (20270112851000); a vista dá-o só com products.view_cost.
      const openQ = poVista(PO_VISTA_ENCOMENDAS)
        .select(PO_COLUMNS)
        .eq("organization_id", orgId)
        .eq("supplier_id", supplierId as string)
        .in("status", OPEN_PO_STATUSES)
        .is("deleted_at", null)
        .order("order_date", { ascending: false })
        .order("id", { ascending: false });
      const recentQ = poVista(PO_VISTA_ENCOMENDAS)
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
