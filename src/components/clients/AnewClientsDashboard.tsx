import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Eye, UserCheck, UserX, TrendingUp, FileText, AlertTriangle, ShieldCheck, HeartPulse, DollarSign, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissionScope } from "@/hooks/usePermissionScope";
import { formatCurrency } from "@/lib/utils";
import { differenceInDays } from "date-fns";

interface AnewClientsDashboardProps {
  companyId?: string;
  activeFilter?: string;
  onFilterChange?: (filter: string) => void;
  scopeOrgIds?: string[];
  activeView?: string;
  salesRepFilter?: string;
  /** Per-client health scores (entity_id -> { score }). When provided, avgHealthScore = arithmetic mean. */
  healthScoresMap?: Map<string, { score: number } | any>;
}

interface DashboardStats {
  totalClients: number;
  activeClients: number;
  inactiveClients: number;
  newLast30Days: number;
  totalContractValue: number;
  avgValuePerClient: number;
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

export function AnewClientsDashboard({ companyId, activeFilter, onFilterChange, scopeOrgIds = [], activeView = "list", salesRepFilter = "all", healthScoresMap }: AnewClientsDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0, activeClients: 0, inactiveClients: 0, newLast30Days: 0,
    totalContractValue: 0, avgValuePerClient: 0, activeContracts: 0,
    noContact30d: 0, noContact30dValue: 0, contractsExpiring30d: 0,
    contractsExpiring30dValue: 0, retentionRate: 0,
    retentionCohortSize: 0, retentionStillActive: 0,
    avgHealthScore: 0, activeEntityIds: [],
  });
  // Track current entity_ids to filter realtime channels for contracts/interactions
  const entityIdsRef = useRef<string[]>([]);
  const { activeCompany } = useCompany();
  const { getPermissionScope, anewUserId, loading: scopeLoading } = usePermissionScope();

  useEffect(() => {
    if (!scopeLoading) loadDashboardData(true);
  }, [companyId, activeCompany?.id, scopeLoading, anewUserId, scopeOrgIds, salesRepFilter]);

  // Safety-net polling every 5 min (realtime channel below is the primary mechanism)
  useEffect(() => {
    if (!initialLoaded || scopeLoading || activeView === "list") return;
    const interval = setInterval(() => loadDashboardData(false), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [initialLoaded, scopeLoading, companyId, activeCompany?.id, anewUserId, scopeOrgIds, activeView]);

  // Realtime: refresh dashboard on any change to clients/contracts/interactions in scope
  useEffect(() => {
    if (!initialLoaded || scopeLoading) return;
    const orgIds = companyId
      ? [companyId]
      : scopeOrgIds.length > 0
        ? scopeOrgIds
        : (activeCompany?.id ? [activeCompany.id] : []);
    if (orgIds.length === 0) return;
    const orgSet = new Set(orgIds);
    let timer: number | null = null;
    const trigger = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => loadDashboardData(false), 1500);
    };

    const channel = supabase.channel('anew-clients-dashboard-realtime');

    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'anew_clients' }, (payload: any) => {
      const orgId = payload?.new?.organization_id ?? payload?.old?.organization_id;
      if (!orgId || orgSet.has(orgId)) trigger();
    });

    // For contracts/interactions: filter by current entity_ids when ≤100; otherwise accept all
    const entityIds = entityIdsRef.current;
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
  }, [initialLoaded, scopeLoading, companyId, activeCompany?.id, scopeOrgIds, stats.activeEntityIds.length]);

  const loadDashboardData = async (isInitial = true) => {
    if (isInitial) setLoading(true);
    try {
      const viewScope = getPermissionScope("clients.view");
      if (viewScope === "NONE") {
        setStats({
          totalClients: 0, activeClients: 0, inactiveClients: 0, newLast30Days: 0,
          totalContractValue: 0, avgValuePerClient: 0, activeContracts: 0,
          noContact30d: 0, noContact30dValue: 0, contractsExpiring30d: 0,
          contractsExpiring30dValue: 0, retentionRate: 0,
          retentionCohortSize: 0, retentionStillActive: 0,
          avgHealthScore: 0, activeEntityIds: [],
        });
        setLoading(false); return;
      }

      let internalUserId: string | null = anewUserId || null;
      let authUserId: string | null = null;
      if (viewScope === "OWNED") {
        const { data: authUser } = await supabase.auth.getUser();
        authUserId = authUser?.user?.id || null;
        if (!internalUserId && authUserId) {
          const { data: anewUser } = await (supabase as any).from("anew_users").select("id").eq("auth_user_id", authUserId).maybeSingle();
          internalUserId = anewUser?.id || null;
        }
      }

      let clientQuery = (supabase as any).from("anew_clients").select("id, entity_id, status, created_by, assigned_to, created_at").is("deleted_at", null);
      if (companyId) clientQuery = clientQuery.eq("organization_id", companyId);
      else if (scopeOrgIds.length > 0) clientQuery = clientQuery.in("organization_id", scopeOrgIds);
      else if (activeCompany?.id) clientQuery = clientQuery.eq("organization_id", activeCompany.id);
      if (viewScope === "OWNED" && internalUserId) {
        clientQuery = clientQuery.or(`assigned_to.eq.${internalUserId},created_by.eq.${internalUserId}`);
      }

      const { data: clientsList, error } = await clientQuery;
      if (error) throw error;
      // Apply salesRep filter client-side
      const list = salesRepFilter !== "all" 
        ? (clientsList || []).filter((c: any) => c.assigned_to === salesRepFilter)
        : (clientsList || []);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const now = new Date();

      const totalClients = list.length;
      const INACTIVE_STATUSES = ["inactive", "churned", "lost", "lost_definitive"];
      const activeClientsList = list.filter((c: any) => !INACTIVE_STATUSES.includes(c.status));
      const activeClients = activeClientsList.length;
      const inactiveClients = list.filter((c: any) => INACTIVE_STATUSES.includes(c.status)).length;
      const newLast30Days = list.filter((c: any) => new Date(c.created_at) >= thirtyDaysAgo).length;

      // Only consider entity_ids of ACTIVE clients for value/contract KPIs (#8)
      const activeEntityIdSet = new Set<string>(
        activeClientsList.map((c: any) => c.entity_id).filter(Boolean)
      );
      const entityIds = list.map((c: any) => c.entity_id).filter(Boolean);
      let totalContractValue = 0;
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

      if (entityIds.length > 0) {
        const contractBatches: string[][] = [];
        for (let i = 0; i < entityIds.length; i += 100) {
          contractBatches.push(entityIds.slice(i, i + 100));
        }
        const contractTasks = contractBatches.map((batch) => async () => {
          const { data } = await supabase.from("client_contracts")
            .select("id, entity_id, status, total_value, end_date")
            .in("entity_id", batch);
          return data || [];
        });
        const contractResults = await runWithLimit(contractTasks, 4);
        for (const contracts of contractResults) {
          for (const c of contracts) {
            const val = (c as any).total_value || 0;
            const eid = (c as any).entity_id;
            const isActive = (c as any).status === "active" || (c as any).status === "signed";
            const clientIsActive = activeEntityIdSet.has(eid);
            if (isActive && clientIsActive) {
              activeContracts++;
              totalContractValue += val;
              if ((c as any).end_date) {
                const endDate = new Date((c as any).end_date);
                const daysUntilExpiry = differenceInDays(endDate, now);
                if (daysUntilExpiry >= 0 && daysUntilExpiry <= 30) {
                  contractsExpiring30d++;
                  contractsExpiring30dValue += val;
                }
              }
            }
            const existing = entityContractMap.get(eid) || { activeCount: 0, totalValue: 0 };
            if (isActive) { existing.activeCount++; existing.totalValue += val; }
            entityContractMap.set(eid, existing);
          }
        }
      }

      const avgValuePerClient = activeClients > 0 ? totalContractValue / activeClients : 0;

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

      // Retention: cohort 90d — clientes que já existiam há ≥90 dias e continuam activos
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const cohort = list.filter((c: any) => new Date(c.created_at) <= ninetyDaysAgo);
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
      entityIdsRef.current = entityIds;

      setStats({
        totalClients, activeClients, inactiveClients, newLast30Days,
        totalContractValue, avgValuePerClient, activeContracts,
        noContact30d, noContact30dValue,
        contractsExpiring30d, contractsExpiring30dValue,
        retentionRate,
        retentionCohortSize: cohort.length,
        retentionStillActive: stillActiveCohort.length,
        avgHealthScore,
        activeEntityIds: activeEntityIdsArr,
      });
    } catch (error) {
      console.error("Error loading clients dashboard:", error);
    } finally {
      if (isInitial) { setLoading(false); setInitialLoaded(true); }
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
          <StatCard title="Valor Contratos" value={formatCurrency(stats.totalContractValue)} icon={DollarSign} iconColor="text-purple-600" loading={loading} />
          <StatCard title="Valor Médio" value={formatCurrency(stats.avgValuePerClient)} icon={DollarSign} iconColor="text-purple-500" loading={loading} />
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
    </div>
  );
}
