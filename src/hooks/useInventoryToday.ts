import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";

// "Hoje" do Inventário: um só pedido (rpc_inventory_today) com os números da
// fila de trabalho, do fluxo e dos contadores do menu. Cada bloco — e cada
// campo — pode vir a null: sem permissão para o ver ou sem forma de o derivar.
// A UI esconde tudo o que vier a null (nunca mostra 0 em vez de "não sei").
//
// Enquanto a função não estiver aplicada na BD (PGRST202 / 404), o hook devolve
// null em silêncio e todos os elementos que dependem dele ficam escondidos —
// nada parte. Outras falhas (timeout, privilégios, rede) também devolvem null,
// mas são reportadas (captureFlowError). Os tipos gerados não a conhecem
// ainda: chamada com cast local.

export interface InventoryTodayPurchases {
  pending_approval: number | null;
  late: number | null;
  portal_unseen: number | null;
  portal_confirmed: number | null;
  open_delivery_notes: number | null;
  delivery_notes_with_divergences: number | null;
}

export interface InventoryTodaySuppliers {
  price_changes_pending: number | null;
  awaiting_profile: number | null;
  /** Artigos do catálogo dos fornecedores (portal) ainda sem produto ligado. */
  catalog_unlinked: number | null;
}

export interface InventoryTodayClientOrders {
  open: number | null;
  ready_to_ship: number | null;
  without_preferred_supplier: number | null;
  by_origin: {
    contract: number | null;
    direct_sale: number | null;
    manual: number | null;
  } | null;
}

export interface InventoryTodayStock {
  below_reorder_point: number | null;
  overstock: number | null;
  reserved_units: number | null;
  value: number | null;
}

export interface InventoryTodayCounts {
  in_progress: number | null;
  stalled: number | null;
}

export interface InventoryTodaySettings {
  stock_deduction_trigger: "contract_signed" | "proposal_accepted" | string | null;
}

export interface InventoryTodayPayload {
  purchases: InventoryTodayPurchases | null;
  suppliers: InventoryTodaySuppliers | null;
  client_orders: InventoryTodayClientOrders | null;
  stock: InventoryTodayStock | null;
  counts: InventoryTodayCounts | null;
  settings: InventoryTodaySettings | null;
}

// Números de contexto, não de operação: 5 min chega e evita um pedido pesado
// (a RPC agrega várias tabelas) a cada troca de separador.
const STALE_TIME = 5 * 60 * 1000;

export const inventoryTodayQueryKey = (orgId: string | null | undefined) =>
  ["inventory-today", orgId ?? null] as const;

/**
 * A função ainda não está aplicada na BD: PostgREST responde PGRST202 (não
 * está no schema cache) com HTTP 404. É o único caso esperado e silencioso.
 */
function isMissingFunction(error: unknown, status?: number): boolean {
  if (status === 404) return true;
  if (typeof error !== "object" || error === null) return false;
  return (error as { code?: unknown }).code === "PGRST202";
}

export async function fetchInventoryToday(orgId: string): Promise<InventoryTodayPayload | null> {
  try {
    const { data, error, status } = await (supabase as any).rpc("rpc_inventory_today", {
      p_organization_id: orgId,
    });
    if (error) {
      // Função ainda por aplicar: null em silêncio, os elementos ficam escondidos.
      if (isMissingFunction(error, status)) return null;
      throw error;
    }
    if (!data || typeof data !== "object") return null;
    return data as InventoryTodayPayload;
  } catch (error) {
    // Timeout (57014), falta de privilégio, rede… — falha real: reportar, mas
    // devolver null na mesma para o ecrã continuar a funcionar sem os números.
    captureFlowError(error, "inventory-today-load");
    return null;
  }
}

/**
 * Números do "Hoje" do Inventário para a organização ativa. `enabled: false`
 * não faz pedido nenhum (ex.: utilizador sem nenhuma permissão de inventário).
 * Devolve `data: null` quando a RPC falha ou ainda não existe.
 */
export function useInventoryToday(options?: { enabled?: boolean }) {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id ?? null;
  const enabled = (options?.enabled ?? true) && !!orgId;

  const query = useQuery({
    queryKey: inventoryTodayQueryKey(orgId),
    queryFn: () => fetchInventoryToday(orgId as string),
    enabled,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
    retry: false,
  });

  return {
    data: enabled ? (query.data ?? null) : null,
    isLoading: enabled && query.isLoading,
    refetch: query.refetch,
  };
}

// ─────────────────────────────────────────────────────────────
// Fila de trabalho — partilhada pela página Hoje e pelo contador do menu,
// para os dois mostrarem sempre o mesmo total.
// ─────────────────────────────────────────────────────────────

export type InventoryQueueTone = "ok" | "warn" | "bad" | "info" | "neutral";

export interface InventoryQueueItem {
  key: string;
  title: string;
  description: string;
  tone: InventoryQueueTone;
  /** Destino ao clicar (com query string só onde a página a lê). */
  to: string;
  /** Permissão da rota de destino — sem ela o cartão não aparece. */
  permission: string;
  value: number;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Cartões da fila com valor conhecido e permissão para o destino. Campos a
 * null ficam de fora (cartão escondido); 0 fica (mostra "Nada pendente").
 */
export function getInventoryQueueItems(
  data: InventoryTodayPayload | null | undefined,
  hasPermission: (permission: string) => boolean,
): InventoryQueueItem[] {
  if (!data) return [];
  const defs: Array<Omit<InventoryQueueItem, "value"> & { value: number | null }> = [
    {
      key: "po-pending",
      title: "POs por aprovar",
      description: "Rascunhos à espera de aprovação para passarem a encomendadas.",
      tone: "warn",
      to: "/purchase-orders",
      permission: "purchase_orders.view",
      value: num(data.purchases?.pending_approval),
    },
    {
      key: "po-late",
      title: "POs atrasadas",
      description: "Entrega prevista ultrapassada sem receção completa.",
      tone: "bad",
      to: "/purchase-orders",
      permission: "purchase_orders.view",
      value: num(data.purchases?.late),
    },
    {
      key: "ec-ready",
      title: "ECs prontas a expedir",
      description: "Têm linhas com stock reservado à espera de saída.",
      tone: "ok",
      to: "/client-orders",
      permission: "client_orders.view",
      value: num(data.client_orders?.ready_to_ship),
    },
    {
      key: "ec-no-supplier",
      title: "ECs sem fornecedor preferencial",
      description: "Há quantidades em falta sem fornecedor para encomendar.",
      tone: "bad",
      to: "/client-orders",
      permission: "client_orders.view",
      value: num(data.client_orders?.without_preferred_supplier),
    },
    {
      key: "price-changes",
      title: "Alterações de preço por aprovar",
      description: "Submetidas pelos fornecedores no portal.",
      tone: "warn",
      to: "/suppliers",
      permission: "suppliers.view",
      value: num(data.suppliers?.price_changes_pending),
    },
    {
      key: "stock-low",
      title: "Produtos abaixo do ponto de encomenda",
      description: "Quantidade igual ou abaixo do ponto de encomenda definido.",
      tone: "warn",
      to: "/stocks?status=low",
      permission: "inventory.view",
      value: num(data.stock?.below_reorder_point),
    },
    {
      key: "counts-stalled",
      title: "Contagem parada",
      description: "Em curso sem atividade há 7 dias ou mais.",
      tone: "neutral",
      to: "/stock-counts",
      permission: "inventory.view",
      value: num(data.counts?.stalled),
    },
    {
      key: "suppliers-awaiting",
      title: "Fornecedores à espera da ficha",
      description: "Convidados para o portal que ainda não preencheram a ficha.",
      tone: "info",
      to: "/suppliers",
      permission: "suppliers.view",
      value: num(data.suppliers?.awaiting_profile),
    },
    {
      key: "catalog-unlinked",
      title: "Artigos do portal por ligar",
      description: "Artigos do catálogo dos fornecedores ainda sem produto nosso ligado.",
      tone: "neutral",
      to: "/suppliers",
      permission: "suppliers.view",
      value: num(data.suppliers?.catalog_unlinked),
    },
    {
      key: "delivery-notes-divergent",
      title: "Guias abertas com divergências",
      description: "Anunciado pelo fornecedor diferente do recebido.",
      tone: "bad",
      to: "/receiving",
      permission: "receiving.view",
      value: num(data.purchases?.delivery_notes_with_divergences),
    },
  ];
  return defs
    .filter((d): d is InventoryQueueItem => d.value !== null && hasPermission(d.permission));
}

/** Total da fila (contador "Hoje" do menu); null quando não há nenhum valor. */
export function getInventoryQueueTotal(
  data: InventoryTodayPayload | null | undefined,
  hasPermission: (permission: string) => boolean,
): number | null {
  const items = getInventoryQueueItems(data, hasPermission);
  if (items.length === 0) return null;
  return items.reduce((acc, item) => acc + item.value, 0);
}

export type InventoryCounterKey =
  | "today"
  | "purchaseOrders"
  | "suppliers"
  | "stocks"
  | "clientOrders"
  | "receiving"
  | "stockCounts";

/** Valor de cada contador do menu do Inventário; null = sem pílula. */
export function getInventoryCounter(
  key: InventoryCounterKey,
  data: InventoryTodayPayload | null | undefined,
  hasPermission: (permission: string) => boolean,
): number | null {
  if (!data) return null;
  switch (key) {
    case "today":
      return getInventoryQueueTotal(data, hasPermission);
    case "purchaseOrders":
      return num(data.purchases?.pending_approval);
    case "suppliers": {
      const a = num(data.suppliers?.price_changes_pending);
      const b = num(data.suppliers?.awaiting_profile);
      return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
    }
    case "stocks":
      return num(data.stock?.below_reorder_point);
    case "clientOrders":
      return num(data.client_orders?.ready_to_ship);
    case "receiving":
      return num(data.purchases?.open_delivery_notes);
    case "stockCounts":
      return num(data.counts?.stalled);
    default:
      return null;
  }
}

/** Permissões que justificam pedir os números do Inventário. */
export const INVENTORY_TODAY_PERMISSIONS = [
  "inventory.view",
  "purchase_orders.view",
  "suppliers.view",
  "client_orders.view",
  "receiving.view",
];
