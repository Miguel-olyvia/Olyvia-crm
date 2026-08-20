import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Eye, UserCheck, UserX, TrendingUp, FileText, AlertTriangle, ShieldCheck, HeartPulse, DollarSign, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissionScope, type ScopeLevel } from "@/hooks/usePermissionScope";
import { formatCurrency } from "@/lib/utils";
import { differenceInDays } from "date-fns";
import { INACTIVE_CLIENT_STATUSES } from "@/lib/clientStatus";

const NEUTRAL_ORIGIN_COLOR = "#94a3b8";

interface OriginBySource {
  source_id: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  client_count: number;
  value_sem_iva: number;
}

interface OriginByCampaign {
  campaign_id: string | null;
  name: string;
  client_count: number;
  value_sem_iva: number;
}

interface OriginDistribution {
  total_clients: number;
  unknown_count: number;
  by_source: OriginBySource[];
  by_campaign: OriginByCampaign[];
}

const DEFAULT_ORIGIN: OriginDistribution = { total_clients: 0, unknown_count: 0, by_source: [], by_campaign: [] };

interface ScopedClientRecord {
  id: string;
  entity_id: string;
  status: string;
  created_by: string | null;
  assigned_to: string | null;
  created_at: string;
}

interface AnewClientsDashboardProps {
  /** Already org+permission+search+filter scoped clients — the single source of truth for KPI computation. */
  scopedClients: ScopedClientRecord[];
  activeFilter?: string;
  onFilterChange?: (filter: string) => void;
  activeView?: string;
  /** Per-client health scores (entity_id -> { score }). When provided, avgHealthScore = arithmetic mean. */
  healthScoresMap?: Map<string, { score: number } | any>;
  /** "Empresa" dropdown value from AnewClients.tsx ("all" or a specific organization id) — the
   * organization actually selected by the user, which must win over activeCompany.id whenever set. */
  companyFilter?: string;
  /**
   * Population for the "Taxa Retenção" cohort calc — must be analyticsClients (org+permission+
   * search+date+health/last-contact/"only mine"/sales-rep scoped, but NOT narrowed by the
   * statusFilter KPI-bar drill-down), the SAME population ClientsRetentionView.tsx uses for its
   * own retentionRate. A churned/inactive client has to remain in this cohort to be counted as
   * lost — narrowing it by statusFilter (as scopedClients is, e.g. when the "Ativos" pill is
   * active) would silently exclude every client capable of showing up as "lost", making the
   * rate trend towards 100% regardless of real churn. Falls back to scopedClients so this prop
   * is optional for any other caller.
   */
  retentionCohortClients?: ScopedClientRecord[];
}

interface DashboardStats {
  totalClients: number;
  activeClients: number;
  inactiveClients: number;
  newLast30Days: number;
  totalContractValue: number;
  totalContractValueWithVat: number;
  avgValuePerClient: number;
  avgValuePerClientWithVat: number;
  activeContracts: number;
  noContact30d: number;
  noContact30dValue: number;
  contractsExpiring30d: number;
  contractsExpiring30dValue: number;
  retentionRate: number;
  retentionCohortSize: number;
  retentionStillActive: number;
  avgHealthScore: number;
  activeEntityIds: string[];
}

const StatCard = ({
  title, value, icon: Icon, iconColor = "text-primary",
  loading = false, highlighted = false, suffix = "", onClick,
  subtitle, badgeColor, badgeCount, tooltipContent,
}: {
  title: string; value: string | number; icon: React.ElementType;
  iconColor?: string; loading?: boolean; highlighted?: boolean;
  suffix?: string; onClick?: () => void;
  subtitle?: string; badgeColor?: string; badgeCount?: number;
  tooltipContent?: React.ReactNode;
}) => {
  if (loading) {
    return (
      <div className="bg-card rounded-xl border p-3.5 min-w-[120px] flex-1">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-12" />
        </div>
      </div>
    );
  }

  const card = (
    <div
      onClick={onClick}
      className={`bg-card rounded-xl border p-3.5 min-w-[120px] flex-1 transition-all ${
        onClick ? 'cursor-pointer hover:shadow-md hover:border-primary/30' : ''
      } ${highlighted ? 'ring-2 ring-primary/60 border-primary/40 shadow-md' : ''}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
        <Icon className={`h-3.5 w-3.5 ${iconColor} opacity-60`} />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-bold tracking-tight">{value}{suffix}</span>
        {badgeCount !== undefined && badgeCount > 0 && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${badgeColor || 'bg-muted text-muted-foreground'}`}>
            {badgeCount}
          </span>
        )}
      </div>
      {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );

  if (tooltipContent) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>{card}</TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs p-3 text-xs leading-relaxed">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return card;
};

const DEFAULT_STATS: DashboardStats = {
  totalClients: 0, activeClients: 0, inactiveClients: 0, newLast30Days: 0,
  totalContractValue: 0, totalContractValueWithVat: 0, avgValuePerClient: 0, avgValuePerClientWithVat: 0, activeContracts: 0,
  noContact30d: 0, noContact30dValue: 0, contractsExpiring30d: 0,
  contractsExpiring30dValue: 0, retentionRate: 0,
  retentionCohortSize: 0, retentionStillActive: 0,
  avgHealthScore: 0, activeEntityIds: [],
};

const DASHBOARD_STALE_TIME_MS = 5 * 60 * 1000;
const DASHBOARD_POLL_INTERVAL_MS = 5 * 60 * 1000;

export function AnewClientsDashboard({ scopedClients, activeFilter, onFilterChange, activeView = "list", healthScoresMap, companyFilter = "all", retentionCohortClients }: AnewClientsDashboardProps) {
  const retentionCohortSource = retentionCohortClients ?? scopedClients;
  const { activeCompany } = useCompany();
  // KPIs feed on client_contracts directly (below), which has its own permission scope —
  // distinct from (and potentially narrower than) the clients.view scope already applied to
  // scopedClients by the parent. Both scopes must be respected (see security note below).
  const { getPermissionScope, anewUserId: scopeAnewUserId, teamMemberIds, loading: contractScopeLoading } = usePermissionScope();

  // entity_ids are derived directly from the already-scoped clients prop — no need to wait
  // for the async KPI fetch to resolve before we know which entities to filter realtime
  // channels for contracts/interactions.
  const entityIds = useMemo(
    () => scopedClients.map((c) => c.entity_id).filter(Boolean),
    [scopedClients]
  );

  // The organization actually selected by the user: the "Empresa" dropdown (companyFilter)
  // wins over activeCompany.id whenever it's set to a specific org, never the other way
  // around. Feeds both rpc_client_contract_stats and rpc_client_origin_distribution below.
  const contractStatsOrgId = companyFilter && companyFilter !== "all" ? companyFilter : activeCompany?.id;

  // client_contracts.view scope: NONE → skip entirely; OWNED/TEAM → restrict to allowed
  // creators (fail closed to an empty set when unresolved, never fall back to "all").
  // Hoisted out of loadDashboardData so the resolved creator scope can also feed the
  // useQuery queryKey below — otherwise a team-membership/role change wouldn't invalidate
  // the cached KPIs.
  const contractViewScope: ScopeLevel = getPermissionScope("client_contracts.view");
  const contractCreatorFilter = useMemo<string[] | null>(() => {
    if (contractViewScope === "OWNED") return scopeAnewUserId ? [scopeAnewUserId] : [];
    if (contractViewScope === "TEAM") {
      const allowed = new Set<string>();
      if (scopeAnewUserId) allowed.add(scopeAnewUserId);
      teamMemberIds.forEach((id) => allowed.add(id));
      return Array.from(allowed);
    }
    if (contractViewScope === "NONE") return [];
    return null; // ORG — no creator restriction
  }, [contractViewScope, scopeAnewUserId, teamMemberIds]);
  const contractScopeBlocked =
    contractScopeLoading ||
    contractViewScope === "NONE" ||
    ((contractViewScope === "OWNED" || contractViewScope === "TEAM") && (contractCreatorFilter?.length ?? 0) === 0);

  // scopedClients is already a stable useMemo reference from the parent, so depending on
  // it directly (rather than a hand-rolled id-only signature) refetches whenever any field
  // the stats depend on (status, assigned_to, created_at, ...) actually changes — not just
  // when the set of ids changes. Cached across remounts within staleTime, so revisiting this
  // dashboard tab reuses the previous fetch instead of discarding it and starting over.
  // companyFilter and contractCreatorFilter are included so switching the "Empresa" dropdown,
  // or a team/role change resolving a different OWNED/TEAM creator scope, both invalidate the
  // cache — previously missing, which could leave the dashboard showing stale totals.
  const { data: stats = DEFAULT_STATS, isLoading: loading, refetch } = useQuery({
    queryKey: ["clients-dashboard", activeCompany?.id, companyFilter, scopedClients, retentionCohortSource, contractScopeLoading, contractCreatorFilter],
    queryFn: () => loadDashboardData(),
    staleTime: DASHBOARD_STALE_TIME_MS,
    // Safety-net polling every 5 min while this view is visible (realtime channel below is
    // the primary mechanism). Matches the previous manual setInterval behavior, except that
    // react-query pauses this refetch while the tab is backgrounded/hidden by default
    // (refetchIntervalInBackground defaults to false) — the old setInterval kept firing
    // in the background regardless of tab visibility, so this is a (desirable) minor change.
    refetchInterval: activeView === "list" ? false : DASHBOARD_POLL_INTERVAL_MS,
    // The previous implementation never refetched on window focus; keep that behavior.
    refetchOnWindowFocus: false,
  });

  // Task 9 — "Origem dos Clientes": same org/entity scope resolved above, via the new
  // rpc_client_origin_distribution RPC. Kept as its own query (distinct shape/refresh
  // cadence from the contract KPIs) but shares contractStatsOrgId/entityIds so it can
  // never disagree with the rest of this dashboard about which organization is selected.
  const { data: originData = DEFAULT_ORIGIN, isLoading: originLoading } = useQuery({
    queryKey: ["clients-origin-distribution", contractStatsOrgId, entityIds],
    queryFn: async (): Promise<OriginDistribution> => {
      if (!contractStatsOrgId) return DEFAULT_ORIGIN;
      const { data, error } = await (supabase as any).rpc("rpc_client_origin_distribution", {
        p_organization_id: contractStatsOrgId,
        p_entity_ids: entityIds.length > 0 ? entityIds : null,
      });
      if (error) {
        console.error("Error loading rpc_client_origin_distribution:", error);
        return DEFAULT_ORIGIN;
      }
      const row = Array.isArray(data) ? data[0] : data;
      return (row as OriginDistribution) ?? DEFAULT_ORIGIN;
    },
    // Card only renders on the "Dashboard" tab (see activeView === "dashboard" below) — no
    // point paying for this RPC call while the user is on Lista/Valor/Retenção.
    enabled: activeView === "dashboard",
    staleTime: DASHBOARD_STALE_TIME_MS,
    refetchOnWindowFocus: false,
  });

  const originPieData = useMemo(() => {
    const slices = (originData.by_source || []).map((s) => ({
      key: s.source_id ?? s.name,
      name: s.name,
      client_count: s.client_count,
      value_sem_iva: s.value_sem_iva,
      color: s.color || NEUTRAL_ORIGIN_COLOR,
    }));
    if (originData.unknown_count > 0) {
      slices.push({
        key: "unknown",
        name: "Desconhecida",
        client_count: originData.unknown_count,
        value_sem_iva: 0,
        color: NEUTRAL_ORIGIN_COLOR,
      });
    }
    return slices;
  }, [originData]);

  const topOriginCampaigns = useMemo(
    () => [...(originData.by_campaign || [])].sort((a, b) => b.client_count - a.client_count).slice(0, 5),
    [originData.by_campaign]
  );

  // Realtime: refresh dashboard on any change to clients/contracts/interactions in scope.
  // Uses contractStatsOrgId (companyFilter-aware), not activeCompany.id alone — otherwise a
  // realtime change to a client/contract under the sub-company selected via "Empresa" would
  // never match orgSet and silently fail to trigger a refresh (masked in practice by the 5min
  // poll interval, but real-time updates would lag behind for the selected sub-company).
  useEffect(() => {
    if (loading) return;
    const orgIds = contractStatsOrgId ? [contractStatsOrgId] : [];
    if (orgIds.length === 0) return;
    const orgSet = new Set(orgIds);
    let timer: number | null = null;
    const trigger = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => { void refetch(); }, 1500);
    };

    const channel = supabase.channel('anew-clients-dashboard-realtime');

    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'anew_clients' }, (payload: any) => {
      const orgId = payload?.new?.organization_id ?? payload?.old?.organization_id;
      if (!orgId || orgSet.has(orgId)) trigger();
    });

    // For contracts/interactions: filter by current entity_ids when ≤100; otherwise accept all
    const useEntityFilter = entityIds.length > 0 && entityIds.length <= 100;
    const filterStr = useEntityFilter ? `entity_id=in.(${entityIds.join(',')})` : undefined;
    const entitySet = useEntityFilter ? new Set(entityIds) : null;

    channel.on('postgres_changes',
      filterStr ? { event: '*', schema: 'public', table: 'client_contracts', filter: filterStr } as any
                : { event: '*', schema: 'public', table: 'client_contracts' },
      (payload: any) => {
        if (!entitySet) { trigger(); return; }
        const eid = payload?.new?.entity_id ?? payload?.old?.entity_id;
        if (!eid || entitySet.has(eid)) trigger();
      });

    channel.on('postgres_changes',
      filterStr ? { event: '*', schema: 'public', table: 'entity_interactions', filter: filterStr } as any
                : { event: '*', schema: 'public', table: 'entity_interactions' },
      (payload: any) => {
        if (!entitySet) { trigger(); return; }
        const eid = payload?.new?.entity_id ?? payload?.old?.entity_id;
        if (!eid || entitySet.has(eid)) trigger();
      });

    channel.subscribe();
    return () => {
      if (timer) window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [loading, contractStatsOrgId, entityIds, refetch]);

  const loadDashboardData = async (): Promise<DashboardStats> => {
    try {
      const list = scopedClients;

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const now = new Date();

      const totalClients = list.length;
      const INACTIVE_STATUSES: readonly string[] = INACTIVE_CLIENT_STATUSES;
      const activeClientsList = list.filter((c: any) => !INACTIVE_STATUSES.includes(c.status));
      const activeClients = activeClientsList.length;
      const inactiveClients = list.filter((c: any) => INACTIVE_STATUSES.includes(c.status)).length;
      const newLast30Days = list.filter((c: any) => new Date(c.created_at) >= thirtyDaysAgo).length;

      // Only consider entity_ids of ACTIVE clients for value/contract KPIs (#8)
      const activeEntityIdSet = new Set<string>(
        activeClientsList.map((c: any) => c.entity_id).filter(Boolean)
      );
      // entityIds mirrors the component-level `entityIds` memo (both derived from scopedClients).
      let totalContractValue = 0;
      let totalContractValueWithVat = 0;
      let activeContracts = 0;
      let contractsExpiring30d = 0;
      let contractsExpiring30dValue = 0;
      const entityContractMap = new Map<string, { activeCount: number; totalValue: number }>();

      // Helper: run async batch tasks with bounded concurrency (#7 fallback)
      const runWithLimit = async <T,>(tasks: (() => Promise<T>)[], limit = 4): Promise<T[]> => {
        const results: T[] = [];
        let i = 0;
        const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
          while (i < tasks.length) {
            const myIdx = i++;
            results[myIdx] = await tasks[myIdx]();
          }
        });
        await Promise.all(workers);
        return results;
      };

      // contractViewScope/contractCreatorFilter/contractScopeBlocked are resolved once at
      // component scope above (also feed the useQuery queryKey) — reused here as-is.

      // organization scope: neither the selected "Empresa" filter nor activeCompany resolved
      // yet → fail closed, skip the contract query entirely rather than silently omitting the
      // organization filter (never leak cross-tenant data). Same guard as ClientsValueView.tsx
      // / ClientsRetentionView.tsx. Uses contractStatsOrgId (companyFilter-aware, resolved at
      // component scope above) — previously this fell back to activeCompany.id directly, so
      // selecting a different "Empresa" here left this per-entity contract map (feeds
      // noContact30dValue) querying the wrong organization_id and silently returning 0 rows
      // for entities whose contracts live under the sub-company actually selected.
      const orgScopeBlocked = !contractStatsOrgId;

      // Per-client contract map (known/converted clients only): feeds noContact30dValue and
      // other per-entity analytics that only make sense for entities already formally
      // registered as clients. Intentionally restricted to entityIds from scopedClients.
      if (entityIds.length > 0 && !contractScopeBlocked && !orgScopeBlocked && contractStatsOrgId) {
        const organizationId = contractStatsOrgId;
        const contractBatches: string[][] = [];
        for (let i = 0; i < entityIds.length; i += 100) {
          contractBatches.push(entityIds.slice(i, i + 100));
        }
        const contractTasks = contractBatches.map((batch) => async () => {
          const q = supabase.from("client_contracts")
            .select("id, entity_id, status, total_value, total_value_sem_iva, end_date")
            .in("entity_id", batch)
            .is("deleted_at", null)
            .eq("organization_id", organizationId);
          const scopedQuery = contractCreatorFilter ? q.in("created_by", contractCreatorFilter) : q;
          const { data, error } = await scopedQuery;
          if (error) {
            console.error("Error loading contracts batch for clients dashboard:", error);
            return [];
          }
          return data || [];
        });
        const contractResults = await runWithLimit(contractTasks, 4);
        for (const contracts of contractResults) {
          for (const c of contracts) {
            const val = (c as any).total_value_sem_iva ?? 0;
            const eid = (c as any).entity_id;
            const isActive = (c as any).status === "active" || (c as any).status === "signed";
            const existing = entityContractMap.get(eid) || { activeCount: 0, totalValue: 0 };
            if (isActive) { existing.activeCount++; existing.totalValue += val; }
            entityContractMap.set(eid, existing);
          }
        }
      }

      // Contract totals for the top KPI cards ("Valor Contratos", "Contratos Activos",
      // "A Expirar"): sourced from rpc_client_contract_stats, scoped to the organization
      // CURRENTLY SELECTED by the user (companyFilter when set, else activeCompany — see
      // contractStatsOrgId above) and to the same entity population as scopedClients — so
      // avgValuePerClient's numerator (value_sem_iva) and denominator (activeClients right
      // below) always describe the same filtered population instead of mixing an org-wide
      // total with a filtered count.
      if (!contractScopeBlocked && contractStatsOrgId) {
        const { data: rpcStats, error: rpcError } = await (supabase as any).rpc("rpc_client_contract_stats", {
          p_organization_id: contractStatsOrgId,
          p_entity_ids: entityIds.length > 0 ? entityIds : null,
          p_creator_ids: contractCreatorFilter,
        });
        if (rpcError) {
          console.error("Error loading rpc_client_contract_stats for clients dashboard:", rpcError);
        } else {
          const row: any = Array.isArray(rpcStats) ? rpcStats[0] : rpcStats;
          if (row) {
            totalContractValue = row.value_sem_iva ?? 0;
            totalContractValueWithVat = row.value_com_iva ?? 0;
            activeContracts = row.active_count ?? 0;
            contractsExpiring30d = row.expiring_soon_count ?? 0;
          }
        }
      }

      const avgValuePerClient = activeClients > 0 ? totalContractValue / activeClients : 0;
      const avgValuePerClientWithVat = activeClients > 0 ? totalContractValueWithVat / activeClients : 0;

      let noContact30d = 0;
      let noContact30dValue = 0;
      if (entityIds.length > 0) {
        const interactionBatches: string[][] = [];
        for (let i = 0; i < entityIds.length; i += 100) {
          interactionBatches.push(entityIds.slice(i, i + 100));
        }
        const lastInteractionMap = new Map<string, string>();
        const interactionTasks = interactionBatches.map((batch) => async () => {
          const { data } = await supabase.from("entity_interactions")
            .select("entity_id, interaction_at")
            .in("entity_id", batch)
            .order("interaction_at", { ascending: false });
          return data || [];
        });
        const interactionResults = await runWithLimit(interactionTasks, 4);
        for (const interactions of interactionResults) {
          for (const int of interactions) {
            if (!lastInteractionMap.has((int as any).entity_id)) {
              lastInteractionMap.set((int as any).entity_id, (int as any).interaction_at);
            }
          }
        }

        for (const client of activeClientsList) {
          const lastDate = lastInteractionMap.get(client.entity_id);
          if (!lastDate || differenceInDays(now, new Date(lastDate)) > 30) {
            noContact30d++;
            const contractInfo = entityContractMap.get(client.entity_id);
            if (contractInfo) noContact30dValue += contractInfo.totalValue;
          }
        }
      }

      // Retention: cohort 90d — clientes que já existiam há ≥90 dias e continuam activos.
      // Deliberately sourced from retentionCohortSource (analyticsClients), NOT `list`
      // (scopedClients/statusFilter-narrowed): a churned/inactive client must remain in this
      // cohort to be counted as lost, so this can never again silently trend towards 100%
      // just because the KPI-bar's status pill (e.g. "Ativos") is active. Matches the same
      // population/formula ClientsRetentionView.tsx uses for its own "Taxa de Retenção", so
      // the two tabs can never again disagree about this number (see "Meta de Retenção: 80%"
      // there and the tooltip below — same target, same population, everywhere on this page).
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const cohort = retentionCohortSource.filter((c: any) => new Date(c.created_at) <= ninetyDaysAgo);
      const stillActiveCohort = cohort.filter((c: any) => !INACTIVE_STATUSES.includes(c.status));
      const retentionRate = cohort.length > 0
        ? Math.round((stillActiveCohort.length / cohort.length) * 100)
        : 100;

      // #6 Health: arithmetic mean of per-client scores. 0 means "no data yet" (UI shows —).
      let avgHealthScore = 0;
      if (healthScoresMap && healthScoresMap.size > 0 && activeClientsList.length > 0) {
        let sum = 0;
        let count = 0;
        for (const c of activeClientsList) {
          const h = healthScoresMap.get(c.entity_id);
          const s = typeof h?.score === "number" ? h.score : null;
          if (s !== null) { sum += s; count++; }
        }
        avgHealthScore = count > 0 ? Math.round(sum / count) : 0;
      }

      const activeEntityIdsArr = Array.from(activeEntityIdSet);

      return {
        totalClients, activeClients, inactiveClients, newLast30Days,
        totalContractValue, totalContractValueWithVat, avgValuePerClient, avgValuePerClientWithVat, activeContracts,
        noContact30d, noContact30dValue,
        contractsExpiring30d, contractsExpiring30dValue,
        retentionRate,
        retentionCohortSize: cohort.length,
        retentionStillActive: stillActiveCohort.length,
        avgHealthScore,
        activeEntityIds: activeEntityIdsArr,
      };
    } catch (error) {
      console.error("Error loading clients dashboard:", error);
      throw error;
    }
  };

  const showExtendedKPIs = activeView === "list" || activeView === "dashboard";

  // Reactive arithmetic mean of per-client health scores when prop arrives later
  const displayedAvgHealth = useMemo(() => {
    if (!healthScoresMap || healthScoresMap.size === 0 || stats.activeEntityIds.length === 0) {
      return stats.avgHealthScore;
    }
    let sum = 0; let count = 0;
    for (const eid of stats.activeEntityIds) {
      const h = healthScoresMap.get(eid);
      const s = typeof h?.score === "number" ? h.score : null;
      if (s !== null) { sum += s; count++; }
    }
    return count > 0 ? Math.round(sum / count) : stats.avgHealthScore;
  }, [healthScoresMap, stats.activeEntityIds, stats.avgHealthScore]);

  const hasHealthData = !!healthScoresMap && healthScoresMap.size > 0;
  const healthColor = !hasHealthData
    ? "text-muted-foreground"
    : displayedAvgHealth >= 60 ? "text-green-600" : displayedAvgHealth >= 40 ? "text-yellow-600" : "text-red-600";

  return (
    <div className="space-y-2.5">
      {/* Row 1: Core counts */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard title="Total" value={stats.totalClients} icon={Eye} iconColor="text-primary" loading={loading}
          highlighted={activeFilter === "all"} onClick={() => onFilterChange?.("all")} />
        <StatCard title="Ativos" value={stats.activeClients} icon={UserCheck} iconColor="text-green-600" loading={loading}
          highlighted={activeFilter === "active"} onClick={() => onFilterChange?.("active")} />
        <StatCard title="Inativos" value={stats.inactiveClients} icon={UserX} iconColor="text-red-600" loading={loading}
          highlighted={activeFilter === "inactive"} onClick={() => onFilterChange?.("inactive")} />
        <StatCard title="Novos (30 dias)" value={stats.newLast30Days} icon={TrendingUp} iconColor="text-blue-600"
          loading={loading} />
      </div>

      {/* Row 2: Contract & health KPIs */}
      {showExtendedKPIs && (
        <div className="grid grid-cols-7 gap-2">
          <StatCard title="Valor Contratos" value={formatCurrency(stats.totalContractValue)} subtitle={`${formatCurrency(stats.totalContractValueWithVat)} com IVA`} icon={DollarSign} iconColor="text-purple-600" loading={loading} />
          <StatCard title="Valor Médio" value={formatCurrency(stats.avgValuePerClient)} subtitle={`${formatCurrency(stats.avgValuePerClientWithVat)} com IVA`} icon={DollarSign} iconColor="text-purple-500" loading={loading} />
          <StatCard title="Contratos Activos" value={stats.activeContracts} icon={FileText} iconColor="text-green-600" loading={loading}
            subtitle={`em ${stats.activeClients} clientes`} />
          <StatCard title="Sem Contacto >30D" value={stats.noContact30d} icon={AlertTriangle} iconColor="text-red-600" loading={loading}
            onClick={() => onFilterChange?.("no_contact_30d")} highlighted={activeFilter === "no_contact_30d"} />
          <StatCard title="A Expirar" value={stats.contractsExpiring30d} icon={Clock} iconColor="text-yellow-600" loading={loading}
            subtitle="Próximos 30d"
            onClick={() => onFilterChange?.("expiring_contracts")} highlighted={activeFilter === "expiring_contracts"} />
          <StatCard title="Taxa Retenção" value={`${stats.retentionRate}%`} icon={ShieldCheck} iconColor="text-green-600" loading={loading}
            tooltipContent={
              <div>
                <p className="font-semibold mb-1">📊 Como é calculada?</p>
                <p>% de clientes que já existiam há 90 dias e continuam activos hoje (cohort fixa de 90 dias).</p>
                {stats.retentionCohortSize > 0 ? (
                  <p className="mt-1 text-muted-foreground">{stats.retentionStillActive} de {stats.retentionCohortSize} retidos = {stats.retentionRate}%</p>
                ) : (
                  <p className="mt-1 text-muted-foreground">Sem clientes com ≥90 dias para calcular.</p>
                )}
                <p className="mt-2 font-semibold">🎯 Para que serve?</p>
                <p>Mede a capacidade real de reter clientes ao longo do tempo. Abaixo de 80% requer atenção.</p>
              </div>
            } />
          <StatCard title="Saúde Média da Carteira" value={hasHealthData ? displayedAvgHealth : "—"} icon={HeartPulse} iconColor={healthColor} loading={loading}
            suffix={hasHealthData ? " /100" : ""} subtitle={hasHealthData ? "Carteira saudável" : "A carregar dados…"}
            tooltipContent={
              <div>
                <p className="font-semibold mb-1">📊 Como é calculada?</p>
                <p>Média aritmética dos health scores individuais de cada cliente activo (mesma fórmula usada na listagem e nas vistas analíticas).</p>
                <p className="mt-2 font-semibold">🎯 Para que serve?</p>
                <p>Indica a saúde global da carteira de clientes. Abaixo de 60 requer atenção imediata.</p>
              </div>
            } />
        </div>
      )}

      {/* Row 3: Origem dos Clientes — só na aba "Dashboard", ao contrário das Rows 1/2 (que
          também aparecem na "Lista" via showExtendedKPIs). Pedido explícito do utilizador. */}
      {activeView === "dashboard" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              🌐 Origem dos Clientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {originLoading ? (
              <div className="h-[160px] flex items-center justify-center">
                <Skeleton className="h-32 w-32 rounded-full" />
              </div>
            ) : originPieData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Sem dados de origem suficientes</p>
            ) : (
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Donut + legend */}
                <div className="flex items-center gap-6 flex-1 min-w-0">
                  <div className="relative w-[160px] h-[160px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={originPieData} cx="50%" cy="50%" outerRadius={70} paddingAngle={2} dataKey="client_count" nameKey="name">
                          {originPieData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(value: number, name: string) => [`${value} clientes`, name]}
                          contentStyle={{
                            backgroundColor: "hsl(var(--background))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-lg font-bold">{originData.total_clients}</span>
                      <span className="text-[10px] text-muted-foreground">Clientes</span>
                    </div>
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-2 min-w-0">
                    {originPieData.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm min-w-0">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                        <span className="text-muted-foreground truncate">{entry.name}</span>
                        <span className="font-semibold ml-auto shrink-0">{entry.client_count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top 5 campaigns */}
                {topOriginCampaigns.length > 0 && (
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Por Campanha (top 5)</p>
                    {topOriginCampaigns.map((c, i) => (
                      <div key={c.campaign_id || i} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 truncate">{c.name}</span>
                        <span className="text-muted-foreground shrink-0">{c.client_count} cliente{c.client_count !== 1 ? "s" : ""}</span>
                        <span className="font-semibold w-24 text-right shrink-0">{formatCurrency(c.value_sem_iva)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!originLoading && originData.unknown_count > 0 && (
              <p className="text-xs text-muted-foreground mt-3 text-center">
                {originData.unknown_count} cliente{originData.unknown_count !== 1 ? "s" : ""} sem origem conhecida
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
