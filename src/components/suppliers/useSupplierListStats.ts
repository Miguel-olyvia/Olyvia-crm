// Estatísticas da lista de Fornecedores (Compras › Fornecedores), lidas em lote
// e sempre filtradas pela organização (orgId). Só leituras — nada muda na BD.
//
//   useSupplierOrgStats(orgId)            → mapas da organização inteira (portal,
//                                           à espera da ficha, preços por aprovar,
//                                           catálogo por ligar). Servem também os
//                                           filtros da lista (conjuntos de ids).
//                                           Cache 5 min.
//   useSupplierRowStats(orgId, ids)       → POs abertas e SLA % dos fornecedores
//                                           carregados na tabela. O relatório de
//                                           SLA é lido uma vez por organização e
//                                           filtrado no cliente.
//
// Fontes:
//   • Portal, à espera da ficha e catálogo por ligar: UMA chamada a
//     rpc_supplier_portal_profile_status(p_organization_id) — uma linha por
//     fornecedor não apagado. awaiting_profile segue a regra exata do contador
//     oficial do Hoje (rpc_inventory_today). Permissão suppliers.view.
//   • Preços por aprovar: supplier_price_change_requests status='pending'
//     (RLS exige suppliers.view_pricing ou products.view_cost; sem isso → null).
//   • POs abertas: purchase_orders status ordered|partially_received, não apagadas
//     (regra de PO aberta do rpc_inventory_today).
//   • SLA %: rpc_get_supplier_sla_report().compliance_pct (exige suppliers.view +
//     suppliers.view_sla_report + purchase_orders.view; sem isso → null).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";

export type SupplierPortalState = "none" | "awaiting" | "active" | "suspended" | "revoked";

export interface SupplierOrgStats {
  /** Estado do portal por fornecedor (ausente = Sem acesso). */
  portal: Map<string, SupplierPortalState>;
  /** Fornecedores (não eliminados) à espera de preencher a ficha no portal. */
  awaiting: { id: string; name: string }[];
  /** Pedidos de preço por aprovar por fornecedor; null = sem permissão/sem dados. */
  pricesPending: Map<string, number> | null;
  /** Artigos do catálogo por ligar por fornecedor (só > 0). */
  catalogUnlinked: Map<string, number> | null;
}

export interface SupplierRowStats {
  /** POs abertas por fornecedor; null = sem dados. */
  openPos: Map<string, number> | null;
  /** SLA % (compliance_pct) por fornecedor; null no mapa = sem prazo/sem receções. */
  slaPct: Map<string, number | null> | null;
}

/** Linha de rpc_supplier_portal_profile_status (RPC ainda fora dos tipos gerados). */
interface PortalProfileStatusRow {
  supplier_id: string;
  portal_status: "invited_awaiting" | "active" | "revoked" | "none";
  awaiting_profile: boolean;
  account_status: "active" | "suspended" | null;
  catalog_unlinked: number | null;
}

type PortalProfileStatusRpc = (
  fn: "rpc_supplier_portal_profile_status",
  args: { p_organization_id: string },
) => PromiseLike<{ data: PortalProfileStatusRow[] | null; error: { message: string } | null }>;

const callPortalProfileStatus = (orgId: string) =>
  (supabase.rpc as unknown as PortalProfileStatusRpc).call(supabase, "rpc_supplier_portal_profile_status", {
    p_organization_id: orgId,
  });

const OPEN_PO_STATUSES = ["ordered", "partially_received"] as const;
const CHUNK = 100;
const ORG_STATS_STALE_MS = 5 * 60 * 1000;

function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const countBy = (rows: readonly { supplier_id: string | null }[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const r of rows) if (r.supplier_id) m.set(r.supplier_id, (m.get(r.supplier_id) ?? 0) + 1);
  return m;
};

function portalStateOf(r: PortalProfileStatusRow): SupplierPortalState {
  const linked = r.portal_status === "active" || r.portal_status === "invited_awaiting";
  // Ligação ativa mas a conta do fornecedor está suspensa: não entra no portal.
  if (linked && r.account_status === "suspended") return "suspended";
  if (r.portal_status === "invited_awaiting") return "awaiting";
  return r.portal_status;
}

async function loadOrgStats(orgId: string, canPricing: boolean): Promise<SupplierOrgStats> {
  // 1. Portal / à espera da ficha / catálogo por ligar — uma só chamada.
  const { data: statusData, error: statusError } = await callPortalProfileStatus(orgId);
  if (statusError) throw statusError;
  const rows = statusData ?? [];

  const portal = new Map<string, SupplierPortalState>();
  const catalogUnlinked = new Map<string, number>();
  const awaitingIds: string[] = [];
  for (const r of rows) {
    const state = portalStateOf(r);
    if (state !== "none") portal.set(r.supplier_id, state);
    if (r.awaiting_profile) awaitingIds.push(r.supplier_id);
    if (r.catalog_unlinked != null && r.catalog_unlinked > 0) catalogUnlinked.set(r.supplier_id, r.catalog_unlinked);
  }

  // 2. Nomes dos que estão à espera (a RPC só devolve ids; já exclui apagados).
  let awaiting: { id: string; name: string }[] = [];
  if (awaitingIds.length > 0) {
    const parts = await Promise.all(
      chunk(awaitingIds, CHUNK).map((part) =>
        supabase
          .from("suppliers")
          .select("id, name")
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .in("id", part),
      ),
    );
    for (const p of parts) {
      if (p.error) throw p.error;
      awaiting = awaiting.concat((p.data ?? []) as { id: string; name: string }[]);
    }
    awaiting.sort((a, b) => a.name.localeCompare(b.name, "pt"));
  }

  // 3. Preços por aprovar (só com permissão de preços, como a RLS).
  let pricesPending: Map<string, number> | null = null;
  if (canPricing) {
    const { data, error } = await supabase
      .from("supplier_price_change_requests")
      .select("supplier_id")
      .eq("organization_id", orgId)
      .eq("status", "pending");
    if (!error) pricesPending = countBy((data ?? []) as { supplier_id: string }[]);
  }

  return { portal, awaiting, pricesPending, catalogUnlinked };
}

/** Mapas da organização inteira (uma chamada à RPC por organização; cache 5 min). */
export function useSupplierOrgStats(orgId: string | null | undefined) {
  const { hasPermission, loading } = usePermissions();
  const canView = hasPermission("suppliers.view");
  const canPricing = canView && (hasPermission("suppliers.view_pricing") || hasPermission("products.view_cost"));
  return useQuery({
    queryKey: ["supplier-list-org-stats", orgId ?? null, canPricing],
    queryFn: () => loadOrgStats(orgId as string, canPricing),
    enabled: !!orgId && !loading && canView,
    staleTime: ORG_STATS_STALE_MS,
  });
}

async function loadOpenPos(orgId: string, ids: readonly string[]): Promise<Map<string, number> | null> {
  const parts = await Promise.all(
    chunk(ids, CHUNK).map((part) =>
      supabase
        .from("purchase_orders")
        .select("supplier_id")
        .eq("organization_id", orgId)
        .in("supplier_id", part)
        .in("status", [...OPEN_PO_STATUSES])
        .is("deleted_at", null),
    ),
  );
  const rows: { supplier_id: string | null }[] = [];
  for (const p of parts) {
    if (p.error) return null;
    rows.push(...((p.data ?? []) as { supplier_id: string | null }[]));
  }
  return countBy(rows);
}

async function loadSlaReport(): Promise<Map<string, number | null> | null> {
  const { data, error } = await supabase.rpc("rpc_get_supplier_sla_report", {});
  if (error) return null;
  const out = new Map<string, number | null>();
  for (const r of data ?? []) out.set(r.supplier_id, r.compliance_pct === null ? null : Number(r.compliance_pct));
  return out;
}

/** POs abertas e SLA % dos fornecedores carregados (ids da organização orgId). */
export function useSupplierRowStats(orgId: string | null | undefined, ids: readonly string[]) {
  const { hasPermission, loading } = usePermissions();
  const canSla =
    hasPermission("suppliers.view") && hasPermission("suppliers.view_sla_report") && hasPermission("purchase_orders.view");
  const sorted = [...ids].sort();

  const openPosQuery = useQuery({
    queryKey: ["supplier-list-open-pos", orgId ?? null, sorted.join(",")],
    queryFn: () => loadOpenPos(orgId as string, sorted),
    enabled: !!orgId && !loading && sorted.length > 0,
    staleTime: 60 * 1000,
  });

  // Relatório de SLA: uma chamada por organização (sem ids na key) e filtrado
  // aqui no cliente — o scroll infinito já não volta a pedir o relatório.
  const slaQuery = useQuery({
    queryKey: ["supplier-list-sla-report", orgId ?? null],
    queryFn: loadSlaReport,
    enabled: !!orgId && !loading && canSla,
    staleTime: ORG_STATS_STALE_MS,
  });

  let slaPct: Map<string, number | null> | null = null;
  if (canSla && slaQuery.data) {
    slaPct = new Map();
    for (const id of sorted) if (slaQuery.data.has(id)) slaPct.set(id, slaQuery.data.get(id) ?? null);
  }

  const data: SupplierRowStats | undefined =
    openPosQuery.data !== undefined || slaPct ? { openPos: openPosQuery.data ?? null, slaPct } : undefined;

  return {
    data,
    isLoading: openPosQuery.isLoading || (canSla && slaQuery.isLoading),
    isError: openPosQuery.isError,
  };
}
