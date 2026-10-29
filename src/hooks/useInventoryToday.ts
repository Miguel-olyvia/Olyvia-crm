import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import {
  clientOrdersLink,
  purchaseOrdersLink,
  receivingLink,
  stockCountsLink,
  stocksLink,
  suppliersLink,
} from "@/components/inventory/ui/inventoryLinks";
import { grupoRececao, poRecebivel, type ReceivablePo } from "@/components/receiving/porReceber";

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
  stock_deduction_trigger: "contract_signed" | "manual" | "proposal_accepted" | string | null;
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
  /** Destino ao clicar: a lista já filtrada (builders de inventoryLinks.ts). */
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
      description: "Rascunhos (manuais ou automáticos). Passar a Encomendado exige purchase_orders.approve.",
      tone: "warn",
      to: purchaseOrdersLink({ status: "pending" }),
      permission: "purchase_orders.view",
      value: num(data.purchases?.pending_approval),
    },
    {
      key: "po-late",
      title: "POs atrasadas",
      description: "Entrega prevista ultrapassada sem receção completa.",
      tone: "bad",
      to: purchaseOrdersLink({ status: "late" }),
      permission: "purchase_orders.view",
      value: num(data.purchases?.late),
    },
    {
      key: "ec-ready",
      title: "ECs prontas a expedir",
      description: "Têm linhas com stock reservado (FIFO) à espera de saída.",
      tone: "ok",
      to: clientOrdersLink({ ready: true }),
      permission: "client_orders.view",
      value: num(data.client_orders?.ready_to_ship),
    },
    {
      key: "ec-no-supplier",
      title: "ECs sem fornecedor preferencial",
      description: "Há quantidades em falta sem fornecedor para encomendar.",
      tone: "bad",
      to: clientOrdersLink({ status: "sem_fornecedor" }),
      permission: "client_orders.view",
      value: num(data.client_orders?.without_preferred_supplier),
    },
    {
      key: "price-changes",
      title: "Alterações de preço por aprovar",
      description: "Submetidas pelos fornecedores no portal.",
      tone: "warn",
      to: suppliersLink({ filter: "prices" }),
      permission: "suppliers.view",
      value: num(data.suppliers?.price_changes_pending),
    },
    {
      key: "stock-low",
      title: "Produtos abaixo do ponto de encomenda",
      description: "Quantidade igual ou abaixo do ponto de encomenda definido.",
      tone: "warn",
      to: stocksLink({ status: "low" }),
      permission: "inventory.view",
      value: num(data.stock?.below_reorder_point),
    },
    {
      key: "counts-stalled",
      title: "Contagem parada",
      description: "Em curso sem atividade há 7 dias ou mais.",
      tone: "neutral",
      to: stockCountsLink({ stalled: true }),
      permission: "inventory.view",
      value: num(data.counts?.stalled),
    },
    {
      key: "suppliers-awaiting",
      title: "Fornecedores à espera da ficha",
      description: "Convidados para o portal: ainda não preencheram a ficha.",
      tone: "info",
      to: suppliersLink({ filter: "awaiting" }),
      permission: "suppliers.view",
      value: num(data.suppliers?.awaiting_profile),
    },
    {
      key: "catalog-unlinked",
      title: "Artigos do portal por ligar",
      description: "Catálogo carregado pelos fornecedores, com sugestões.",
      tone: "neutral",
      to: suppliersLink({ filter: "catalog" }),
      permission: "suppliers.view",
      value: num(data.suppliers?.catalog_unlinked),
    },
    {
      key: "delivery-notes-divergent",
      title: "Guias abertas com divergências",
      description: "Anunciado diferente do recebido.",
      tone: "bad",
      to: receivingLink({ notes: "divergent" }),
      permission: "receiving.view",
      value: num(data.purchases?.delivery_notes_with_divergences),
    },
  ];
  return defs
    .filter((d): d is InventoryQueueItem => d.value !== null && hasPermission(d.permission));
}

// ─────────────────────────────────────────────────────────────
// "Encomendas por receber no armazém" e o botão "Receber no armazém →" (como
// o Hoje do 2.0: contadores.porReceber e chegamHojePos). Calculado das POs da
// Receção (useReceivablePos — as mesmas linhas e regras da lista Por receber),
// não da RPC; por isso fica fora de getInventoryQueueItems e do total do menu
// (no 2.0 o total do Hoje também não conta este cartão).
// ─────────────────────────────────────────────────────────────

export interface InventoryReceivingSummary {
  /** POs encomendadas ou parcialmente recebidas com alguma linha de produto por receber. */
  awaiting: number;
  /** Dessas, as já expedidas pelo fornecedor no portal (guia do portal ainda aberta). */
  shipped: number;
  /** POs por receber que chegam hoje/amanhã ou já expedidas (grupos −1 e 0 da Receção), pela ordem da lista. */
  arrivingIds: string[];
}

const AWAITING_STATUSES = new Set(["ordered", "partially_received"]);

/** Resumo das POs por receber; `today` = "YYYY-MM-DD" em hora local (todayIsoLocal). */
export function getReceivingSummary(pos: readonly ReceivablePo[], today: string): InventoryReceivingSummary {
  const open = pos.filter(poRecebivel);
  const awaiting = open.filter((p) => AWAITING_STATUSES.has(p.status));
  return {
    awaiting: awaiting.length,
    shipped: awaiting.filter((p) => !!p.shipped).length,
    arrivingIds: open.filter((p) => grupoRececao(p, today) <= 0).map((p) => p.id),
  };
}

/** "Receber no armazém →": com uma só PO a chegar hoje/amanhã abre logo o painel dela; senão a lista Por receber. */
export function getReceiveTarget(summary: InventoryReceivingSummary | null | undefined): string {
  const ids = summary?.arrivingIds ?? [];
  return ids.length === 1 ? receivingLink({ po: ids[0] }) : receivingLink();
}

/** Cartão da fila "Encomendas por receber no armazém"; null sem dados ou sem permissão para a Receção. */
export function getReceivingQueueItem(
  summary: InventoryReceivingSummary | null | undefined,
  hasPermission: (permission: string) => boolean,
): (InventoryQueueItem & { shipped: number }) | null {
  if (!summary || !hasPermission("receiving.view")) return null;
  return {
    key: "po-awaiting-receipt",
    title: "Encomendas por receber no armazém",
    description: "Encomendas a fornecedor (encomendadas ou parciais) à espera de entrada em Armazém › Receção.",
    tone: "info",
    to: receivingLink(),
    permission: "receiving.view",
    value: summary.awaiting,
    shipped: summary.shipped,
  };
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
