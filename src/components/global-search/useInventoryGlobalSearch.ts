import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useDebounce } from "@/hooks/useDebounce";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import {
  GLOBAL_SEARCH_DEBOUNCE_MS,
  GLOBAL_SEARCH_LIMIT,
  buildGlobalSearchGroups,
  isSearchable,
  normalizeSearchQuery,
  type GlobalSearchGroup,
  type GlobalSearchPayload,
} from "./globalSearchResults";

/** A função ainda não está aplicada na BD (PGRST202 / HTTP 404). */
export class GlobalSearchUnavailableError extends Error {
  constructor() {
    super("rpc_inventory_global_search ainda não existe na BD");
    this.name = "GlobalSearchUnavailableError";
  }
}

function isMissingFunction(error: unknown, status?: number): boolean {
  if (status === 404) return true;
  if (typeof error !== "object" || error === null) return false;
  return (error as { code?: unknown }).code === "PGRST202";
}

// Os tipos gerados ainda não conhecem a função: chamada com cast local.
export async function fetchInventoryGlobalSearch(
  orgId: string,
  query: string,
  signal?: AbortSignal,
): Promise<GlobalSearchPayload> {
  let builder = (supabase as any).rpc("rpc_inventory_global_search", {
    p_org_id: orgId,
    p_query: query,
    p_limit: GLOBAL_SEARCH_LIMIT,
  });
  if (signal && typeof builder?.abortSignal === "function") builder = builder.abortSignal(signal);
  const { data, error, status } = await builder;
  if (error) {
    if (isMissingFunction(error, status)) throw new GlobalSearchUnavailableError();
    captureFlowError(error, "inventory-global-search");
    throw error;
  }
  return (data && typeof data === "object" ? data : {}) as GlobalSearchPayload;
}

export const inventoryGlobalSearchQueryKey = (orgId: string | null, query: string) =>
  ["inventory-global-search", orgId, query.toLowerCase()] as const;

export type GlobalSearchStatus = "idle" | "short" | "loading" | "error" | "unavailable" | "ready";

export interface UseInventoryGlobalSearchResult {
  status: GlobalSearchStatus;
  groups: GlobalSearchGroup[];
  /** O texto a que os resultados dizem respeito (já sem espaços e debounced). */
  query: string;
  retry: () => void;
}

/**
 * Pesquisa global para a organização ativa, com debounce. Só pede à BD com
 * ≥ 2 caracteres; enquanto o texto escrito não chegou ao debounce, ou o pedido
 * está em curso, o estado é "loading" (nunca mostra resultados de outro texto).
 */
export function useInventoryGlobalSearch(
  rawQuery: string,
  options: { enabled?: boolean; hasPermission?: (permission: string) => boolean } = {},
): UseInventoryGlobalSearchResult {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id ?? null;
  const typed = normalizeSearchQuery(rawQuery);
  const debounced = useDebounce(typed, GLOBAL_SEARCH_DEBOUNCE_MS);
  const enabled = (options.enabled ?? true) && !!orgId && isSearchable(debounced);

  const q = useQuery({
    queryKey: inventoryGlobalSearchQueryKey(orgId, debounced),
    queryFn: ({ signal }) => fetchInventoryGlobalSearch(orgId as string, debounced, signal),
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const retry = () => {
    void q.refetch();
  };

  if (!typed) return { status: "idle", groups: [], query: typed, retry };
  if (!isSearchable(typed)) return { status: "short", groups: [], query: typed, retry };
  if (!orgId) return { status: "idle", groups: [], query: typed, retry };
  if (typed !== debounced || (enabled && q.isPending) || (q.isFetching && !q.isSuccess)) {
    return { status: "loading", groups: [], query: typed, retry };
  }
  if (q.isError) {
    return {
      status: q.error instanceof GlobalSearchUnavailableError ? "unavailable" : "error",
      groups: [],
      query: debounced,
      retry,
    };
  }
  return {
    status: "ready",
    groups: buildGlobalSearchGroups(q.data, options.hasPermission),
    query: debounced,
    retry,
  };
}
