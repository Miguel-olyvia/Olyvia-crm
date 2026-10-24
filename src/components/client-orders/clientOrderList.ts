// Dados da lista "Saídas para clientes" (ClientOrders.tsx) que não cabem numa
// página: contagens por estado (pílulas e KPI), prontidão por encomenda
// (barra de progresso em unidades, "N pronta(s) a sair", filtro "Prontas a
// expedir") e exportação das linhas filtradas. Tudo filtrado pela organização
// ativa (p_organization_id).
//   rpc_list_client_order_documents — a lista; não devolve total nem aceita
//     limite > 100: lê-se em páginas de 100 até esgotar ou até um teto, e o
//     resultado diz se ficou truncado.
//   rpc_client_order_list_readiness — prontidão por contrato, numa só chamada
//     (mesma regra de "pronta" que rpc_inventory_today.ready_to_ship).
import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ClientOrderOverallStatus =
  | "totalmente_servido"
  | "parcialmente_pendente"
  | "a_aguardar_encomenda"
  | "sem_fornecedor";

/** Linha devolvida pela RPC da lista (subconjunto usado aqui e na página). */
export interface ClientOrderListRow {
  contract_id: string;
  contract_number: string;
  order_number?: string | null;
  origin_type?: "contract" | "direct_sale" | "manual" | null;
  origin_number?: string | null;
  client_name: string | null;
  signature_date: string | null;
  total_lines: number;
  lines_from_stock: number;
  lines_awaiting_order: number;
  lines_received: number;
  lines_no_supplier: number;
  lines_service?: number | null;
  overall_status: string;
  delivery_address?: string | null;
}

export interface ClientOrderListFilters {
  search: string;
  status: string;
  dateFrom: string;
  dateTo: string;
}

const PAGE = 100;

async function fetchListPage(
  organizationId: string,
  filters: ClientOrderListFilters,
  page: number,
): Promise<ClientOrderListRow[]> {
  const { data, error } = await supabase.rpc("rpc_list_client_order_documents", {
    p_organization_id: organizationId,
    p_search: filters.search || null,
    p_status_filter: filters.status === "all" ? null : filters.status,
    p_limit: PAGE,
    p_offset: page * PAGE,
    p_date_from: filters.dateFrom || null,
    p_date_to: filters.dateTo || null,
  } as any);
  if (error) throw error;
  return (data as unknown as ClientOrderListRow[] | null) ?? [];
}

export async function fetchAllClientOrderRows(
  organizationId: string,
  filters: ClientOrderListFilters,
  maxPages: number,
): Promise<{ rows: ClientOrderListRow[]; truncated: boolean }> {
  const rows: ClientOrderListRow[] = [];
  for (let page = 0; page < maxPages; page++) {
    const chunk = await fetchListPage(organizationId, filters, page);
    rows.push(...chunk);
    if (chunk.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/**
 * Só as linhas da lista cujo contract_id está em `ids`, com os mesmos filtros
 * da lista (rpc_list_client_order_documents não filtra por ids). Lê páginas de
 * 100 pela ordem da lista e pára assim que encontrou todos os ids, quando a
 * lista acaba ou no teto (truncated = pode faltar alguma).
 */
export async function fetchClientOrderRowsByIds(
  organizationId: string,
  filters: ClientOrderListFilters,
  ids: ReadonlySet<string>,
  maxPages: number,
): Promise<{ rows: ClientOrderListRow[]; truncated: boolean }> {
  const rows: ClientOrderListRow[] = [];
  if (ids.size === 0) return { rows, truncated: false };
  const found = new Set<string>();
  for (let page = 0; page < maxPages; page++) {
    const chunk = await fetchListPage(organizationId, filters, page);
    for (const r of chunk) {
      if (ids.has(r.contract_id) && !found.has(r.contract_id)) {
        found.add(r.contract_id);
        rows.push(r);
      }
    }
    if (found.size >= ids.size || chunk.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

// ── Prontidão por encomenda (rpc_client_order_list_readiness) ──────────────

/** Unidades base (de stock). Numa linha em aberto: needed = served + reserved + on_po + missing. */
export interface ClientOrderReadiness {
  contract_id: string;
  /** Linhas em aberto com stock reservado — prontas a sair. */
  lines_ready: number;
  units_ready: number;
  units_in_stock_reserved: number;
  units_on_po: number;
  units_missing: number;
  /** Entregue: saída de stock + recebido do fornecedor para a encomenda. */
  units_served: number;
  units_received: number;
  units_needed: number;
}

export type ClientOrderReadinessMap = Record<string, ClientOrderReadiness>;

/** Os tipos gerados ainda não conhecem a função: chamada com cast local. */
type ReadinessRpc = (
  fn: "rpc_client_order_list_readiness",
  args: { p_organization_id: string; p_contract_ids?: string[] | null },
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

const toNum = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export async function fetchClientOrderReadiness(organizationId: string): Promise<ClientOrderReadinessMap> {
  const rpc = supabase.rpc.bind(supabase) as unknown as ReadinessRpc;
  const { data, error } = await rpc("rpc_client_order_list_readiness", { p_organization_id: organizationId });
  if (error) throw error;
  const map: ClientOrderReadinessMap = {};
  for (const raw of (data as Array<Record<string, unknown>> | null) ?? []) {
    const id = String(raw.contract_id ?? "");
    if (!id) continue;
    map[id] = {
      contract_id: id,
      lines_ready: toNum(raw.lines_ready),
      units_ready: toNum(raw.units_ready),
      units_in_stock_reserved: toNum(raw.units_in_stock_reserved),
      units_on_po: toNum(raw.units_on_po),
      units_missing: toNum(raw.units_missing),
      units_served: toNum(raw.units_served),
      units_received: toNum(raw.units_received),
      units_needed: toNum(raw.units_needed),
    };
  }
  return map;
}

export const clientOrderReadinessQueryKey = (organizationId: string) =>
  ["client-order-list-readiness", organizationId] as const;

/** A prontidão da organização não depende da pesquisa: reaproveita-se 1 min. */
const READINESS_STALE_MS = 60 * 1000;

/**
 * No máximo uma chamada por carregamento da lista: usa a cache se tiver menos
 * de 1 min, salvo `force` (a lista recarregou depois de uma ação).
 */
export function loadClientOrderReadiness(
  queryClient: QueryClient,
  organizationId: string,
  force: boolean,
): Promise<ClientOrderReadinessMap> {
  return queryClient.fetchQuery({
    queryKey: clientOrderReadinessQueryKey(organizationId),
    queryFn: () => fetchClientOrderReadiness(organizationId),
    staleTime: force ? 0 : READINESS_STALE_MS,
    retry: false,
  });
}

export const readyContractIds = (map: ClientOrderReadinessMap | null | undefined): Set<string> =>
  new Set(Object.values(map ?? {}).filter((r) => r.lines_ready > 0).map((r) => r.contract_id));

// ── Contagens por estado (pílulas e KPI) ───────────────────────────────────

export interface ClientOrderStatusSummary {
  total: number;
  byStatus: Record<ClientOrderOverallStatus, number>;
  /** Teto de leitura atingido: os números são "pelo menos". */
  truncated: boolean;
}

// Até 500 encomendas (5 chamadas sequenciais) — acima disso mostra "N+".
const SUMMARY_MAX_PAGES = 5;
const SUMMARY_STALE_MS = 5 * 60 * 1000;

/**
 * Contagem por estado com as datas atuais — sem pesquisa nem filtro de estado,
 * para as pílulas mostrarem quanto cada uma daria. Escrever na pesquisa não
 * volta a ler. `version` muda quando a lista recarrega depois de uma ação
 * (criar, editar, eliminar…) → nova leitura, mantendo os números anteriores
 * enquanto chega.
 *
 * rpc_client_order_list_readiness não devolve overall_status (calculado só por
 * rpc_list_client_order_documents), por isso não serve para estas contagens.
 */
export function useClientOrderStatusSummary(
  organizationId: string | null | undefined,
  filters: Pick<ClientOrderListFilters, "dateFrom" | "dateTo">,
  version: number,
) {
  return useQuery({
    queryKey: ["client-orders-status-summary", organizationId ?? null, filters.dateFrom, filters.dateTo, version],
    enabled: !!organizationId,
    staleTime: SUMMARY_STALE_MS,
    // Números anteriores enquanto chegam os novos — nunca os de outra organização.
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[1] === (organizationId ?? null) ? keepPreviousData(prev) : undefined,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async (): Promise<ClientOrderStatusSummary> => {
      const { rows, truncated } = await fetchAllClientOrderRows(
        organizationId as string,
        { search: "", status: "all", dateFrom: filters.dateFrom, dateTo: filters.dateTo },
        SUMMARY_MAX_PAGES,
      );
      const byStatus: Record<ClientOrderOverallStatus, number> = {
        totalmente_servido: 0,
        parcialmente_pendente: 0,
        a_aguardar_encomenda: 0,
        sem_fornecedor: 0,
      };
      for (const r of rows) {
        if (r.overall_status in byStatus) byStatus[r.overall_status as ClientOrderOverallStatus] += 1;
      }
      return { total: rows.length, byStatus, truncated };
    },
  });
}
