import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow, startOfDay, subDays } from "date-fns";
import { pt } from "date-fns/locale";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar as CalendarIcon,
  CalendarCheck,
  CalendarRange,
  Clock,
  Filter,
  Mail,
  MessageCircle,
  PhoneCall,
  StickyNote,
  Target,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEntityIdentity } from "@/hooks/useEntityIdentity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  buildDashboardScopedRpcParams,
  buildNegotiationScopeFilter,
  daysBetween,
  deriveCampaignDistribution,
  deriveDashboardKpis,
  deriveLeadsOverTime,
  deriveSourceDistribution,
  deriveStageFunnel,
  deriveStatusDistribution,
  getAssigneeIds,
  getComparisonPeriod,
  getDashboardRenderState,
  resolveDashboardDateRange,
  resolveDashboardScope,
  type DashboardStats,
  type LeadsDashboardQuery,
  type NegotiationLeadRow,
} from "./leadsDashboardHelpers";

const NEGOTIATION_LIST_LIMIT = 20;
const ACTIVITY_FEED_LIMIT = 15;
// Fetches more raw interactions than ACTIVITY_FEED_LIMIT because rows are
// filtered down afterwards to lead-only entity_ids (entity_interactions is
// shared across leads/clients/contacts and has no module discriminator).
const ACTIVITY_FEED_FETCH_LIMIT = 60;

const currencyFormatter = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });

// Mirrors the icon/label convention already used for entity_interactions in
// src/components/leads/detail/LeadTimelineTab.tsx (TYPE_CONFIG), scoped down
// to the interaction types relevant to this aggregated feed.
const ACTIVITY_TYPE_CONFIG: Record<string, { icon: typeof PhoneCall; label: string }> = {
  call: { icon: PhoneCall, label: "Chamada" },
  email: { icon: Mail, label: "Email" },
  meeting: { icon: Users, label: "Reunião" },
  whatsapp: { icon: MessageCircle, label: "WhatsApp" },
  visit: { icon: CalendarIcon, label: "Visita" },
  note: { icon: StickyNote, label: "Nota" },
};

function getActivityTypeConfig(interactionType: string | null) {
  return ACTIVITY_TYPE_CONFIG[interactionType ?? ""] ?? ACTIVITY_TYPE_CONFIG.note;
}

interface ActivityFeedRow {
  id: string;
  entity_id: string | null;
  interaction_type: string | null;
  subject: string | null;
  notes: string | null;
  interaction_at: string;
}

interface WorkflowStage {
  id: string;
  name: string;
  label: string;
  color: string;
  stage_order: number;
}

interface Campaign {
  id: string;
  name: string;
}

interface User {
  id: string;
  name: string | null;
}

interface LeadsDashboardProps {
  leads?: unknown[];
  workflowStages: WorkflowStage[];
  campaigns: Campaign[];
  companyId?: string | null;
  query?: LeadsDashboardQuery | null;
  /** Visible-team user ids for the current viewer, required to replicate TEAM-scope narrowing on the direct negotiation-leads query (the scoped RPC only returns aggregates, not rows). */
  teamMemberIds?: string[];
}

function formatMetricValue(value: number | string | null, suffix = ""): string {
  if (value === null || value === undefined || value === "") return "--";
  return `${value}${suffix}`;
}

function renderPlaceholderCard(title: string, description: string) {
  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: typeof Users;
  trend?: "up" | "down";
  trendValue?: number | null;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            {trend && trendValue !== null && trendValue !== undefined && (
              <div
                className={`flex items-center gap-1 text-sm ${
                  trend === "up" ? "text-success" : "text-destructive"
                }`}
              >
                {trend === "up" ? (
                  <ArrowUpRight className="h-4 w-4" />
                ) : (
                  <ArrowDownRight className="h-4 w-4" />
                )}
                <span>{Math.abs(trendValue)}%</span>
                <span className="text-muted-foreground">vs período anterior</span>
              </div>
            )}
          </div>
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function LeadsDashboard(props: LeadsDashboardProps) {
  const { query, workflowStages, teamMemberIds } = props;
  const { getIdentity, resolveEntities } = useEntityIdentity();
  const [dateRange, setDateRange] = useState(() => resolveDashboardDateRange(query?.filters));
  const [compareMode, setCompareMode] = useState(false);
  const [dashboardView, setDashboardView] = useState<"leads" | "pipeline">("leads");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [comparisonStats, setComparisonStats] = useState<DashboardStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    setDateRange(resolveDashboardDateRange(query?.filters));
  }, [query?.orgId, query?.filters?.dateFrom, query?.filters?.dateTo]);

  useEffect(() => {
    if (!query) {
      setStats(null);
      setComparisonStats(null);
      setUsers([]);
      setLoading(false);
      setError("Configuração do dashboard em falta. O caller deve passar a query scoped.");
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();

    const loadStats = async () => {
      setLoading(true);
      setError(null);

      try {
        const mainParams = { ...buildDashboardScopedRpcParams(query, dateRange), p_compare_previous: false };
        const comparisonRange = compareMode ? getComparisonPeriod(dateRange) : null;
        const [mainResult, comparisonResult] = await Promise.all([
          (supabase.rpc as any)("get_lead_dashboard_stats_scoped", mainParams).abortSignal(abortController.signal),
          compareMode && comparisonRange
            ? (supabase.rpc as any)("get_lead_dashboard_stats_scoped", {
                ...buildDashboardScopedRpcParams(query, comparisonRange),
                p_compare_previous: false,
              }).abortSignal(abortController.signal)
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (mainResult?.error) throw new Error(mainResult.error.message || "Erro ao carregar dashboard.");
        if (comparisonResult?.error) {
          throw new Error(comparisonResult.error.message || "Erro ao carregar comparação do dashboard.");
        }

        if (!cancelled) {
          setStats((mainResult?.data as DashboardStats | null) ?? null);
          setComparisonStats((comparisonResult?.data as DashboardStats | null) ?? null);
        }
      } catch (loadError) {
        if (cancelled || abortController.signal.aborted) return;
        const message = loadError instanceof Error ? loadError.message : "Erro ao carregar dashboard.";
        console.error("Error loading scoped lead dashboard stats:", loadError);
        setStats(null);
        setComparisonStats(null);
        setUsers([]);
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadStats();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [
    query,
    dateRange.from,
    dateRange.to,
    compareMode,
    refreshTick,
  ]);

  useEffect(() => {
    if (!query) return;

    const interval = setInterval(() => {
      setRefreshTick((current) => current + 1);
    }, 300000);

    return () => clearInterval(interval);
  }, [query]);

  const negotiationScope = query ? resolveDashboardScope(query) : null;
  const teamMemberIdsKey = (teamMemberIds ?? []).join(",");

  const {
    data: negotiationData,
    isLoading: negotiationLoading,
    error: negotiationQueryError,
  } = useQuery({
    queryKey: [
      "leads-dashboard-negotiation",
      query?.orgId,
      negotiationScope,
      query?.anewUserId,
      query?.authUserId,
      teamMemberIdsKey,
    ],
    queryFn: async () => {
      if (!query) return { rows: [] as NegotiationLeadRow[], totalCount: 0, deals: new Map<string, number>() };

      let negotiationQuery = supabase
        .from("anew_leads")
        .select("id, entity_id, assigned_to, updated_at, created_at", { count: "exact" })
        .eq("organization_id", query.orgId)
        .eq("status", "negotiation")
        .is("deleted_at", null)
        .order("updated_at", { ascending: true })
        .range(0, NEGOTIATION_LIST_LIMIT - 1);

      const scopeFilter = buildNegotiationScopeFilter(query, teamMemberIds ?? []);
      if (scopeFilter) {
        negotiationQuery = negotiationQuery.or(scopeFilter);
      }

      const { data, error: negotiationError, count } = await negotiationQuery;
      if (negotiationError) throw new Error(negotiationError.message || "Erro ao carregar leads em negociação.");

      const rows = (data ?? []) as NegotiationLeadRow[];
      const leadIds = rows.map((row) => row.id);
      const dealsByLead = new Map<string, number>();

      if (leadIds.length > 0) {
        const { data: dealsData, error: dealsError } = await supabase
          .from("deals")
          .select("lead_id, value, created_at")
          .in("lead_id", leadIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false });

        if (dealsError) {
          console.error("Error loading negotiation deal values:", dealsError);
        } else {
          (dealsData ?? []).forEach((deal: { lead_id: string | null; value: number | null }) => {
            if (deal.lead_id && !dealsByLead.has(deal.lead_id)) {
              dealsByLead.set(deal.lead_id, deal.value ?? 0);
            }
          });
        }
      }

      return { rows, totalCount: count ?? rows.length, deals: dealsByLead };
    },
    enabled: !!query && dashboardView === "pipeline",
    staleTime: 60_000,
  });

  const negotiationRows = negotiationData?.rows ?? [];
  const negotiationTotalCount = negotiationData?.totalCount ?? 0;

  const {
    data: activityRows,
    isLoading: activityLoading,
    error: activityQueryError,
  } = useQuery({
    queryKey: [
      "leads-dashboard-activity",
      query?.orgId,
      negotiationScope,
      query?.anewUserId,
      query?.authUserId,
      teamMemberIdsKey,
    ],
    queryFn: async (): Promise<ActivityFeedRow[]> => {
      if (!query) return [];

      const { data: interactionsData, error: interactionsError } = await supabase
        .from("entity_interactions")
        .select("id, entity_id, interaction_type, subject, notes, interaction_at")
        .eq("organization_id", query.orgId)
        .order("interaction_at", { ascending: false })
        .limit(ACTIVITY_FEED_FETCH_LIMIT);

      if (interactionsError) {
        throw new Error(interactionsError.message || "Erro ao carregar atividade recente.");
      }

      const candidateInteractions = (interactionsData ?? []) as ActivityFeedRow[];
      const candidateEntityIds = Array.from(
        new Set(candidateInteractions.map((row) => row.entity_id).filter((id): id is string => Boolean(id))),
      );

      if (candidateEntityIds.length === 0) return [];

      // entity_interactions is shared across leads/clients/contacts and has no
      // module discriminator column, so lead-only rows are determined by
      // inner-joining the candidate entity_ids against anew_leads, applying
      // the same organization + ORG/TEAM/OWNED scoping used elsewhere in this
      // dashboard (buildNegotiationScopeFilter).
      let leadsQuery = supabase
        .from("anew_leads")
        .select("entity_id")
        .eq("organization_id", query.orgId)
        .is("deleted_at", null)
        .in("entity_id", candidateEntityIds);

      const scopeFilter = buildNegotiationScopeFilter(query, teamMemberIds ?? []);
      if (scopeFilter) {
        leadsQuery = leadsQuery.or(scopeFilter);
      }

      const { data: leadsData, error: leadsError } = await leadsQuery;
      if (leadsError) {
        throw new Error(leadsError.message || "Erro ao carregar atividade recente.");
      }

      const leadEntityIds = new Set(
        (leadsData ?? []).map((row) => (row as { entity_id: string | null }).entity_id).filter(Boolean),
      );

      return candidateInteractions
        .filter((row) => row.entity_id && leadEntityIds.has(row.entity_id))
        .slice(0, ACTIVITY_FEED_LIMIT);
    },
    enabled: !!query && dashboardView === "pipeline",
    staleTime: 60_000,
  });

  const activityFeedRows = activityRows ?? [];

  useEffect(() => {
    const entityIds = negotiationRows.map((row) => row.entity_id).filter((id): id is string => Boolean(id));
    if (entityIds.length > 0) {
      resolveEntities(entityIds);
    }
    // resolveEntities is stable-ish (memoized on identityMap) but must not be
    // re-run on every identityMap change, only when the negotiation rows change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negotiationRows]);

  useEffect(() => {
    const entityIds = activityFeedRows.map((row) => row.entity_id).filter((id): id is string => Boolean(id));
    if (entityIds.length > 0) {
      resolveEntities(entityIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityFeedRows]);

  useEffect(() => {
    const statsAssigneeIds = getAssigneeIds(stats);
    const negotiationAssigneeIds = negotiationRows
      .map((row) => row.assigned_to)
      .filter((id): id is string => Boolean(id));
    const assigneeIds = Array.from(new Set([...statsAssigneeIds, ...negotiationAssigneeIds]));

    if (!query || assigneeIds.length === 0) {
      setUsers([]);
      return;
    }

    let cancelled = false;

    const loadUsers = async () => {
      const { data, error: usersError } = await supabase.from("anew_users").select("id, name").in("id", assigneeIds);

      if (usersError) {
        console.error("Error loading dashboard assignees:", usersError);
        if (!cancelled) setUsers([]);
        return;
      }

      if (!cancelled) {
        setUsers((data || []) as User[]);
      }
    };

    loadUsers();

    return () => {
      cancelled = true;
    };
  }, [query, stats, negotiationRows]);

  const renderState = getDashboardRenderState({
    query,
    loading,
    error,
    stats,
  });

  const kpis = useMemo(
    () =>
      deriveDashboardKpis({
        stats,
        comparisonStats,
        dateRange,
      }),
    [stats, comparisonStats, dateRange],
  );

  const leadsOverTime = useMemo(
    () =>
      deriveLeadsOverTime({
        stats,
        comparisonStats,
        dateRange,
        compareMode,
      }),
    [stats, comparisonStats, dateRange, compareMode],
  );

  const statusDistribution = useMemo(() => deriveStatusDistribution(stats), [stats]);
  const leadsByCampaign = useMemo(() => deriveCampaignDistribution(stats), [stats]);
  const sourceDistribution = useMemo(() => deriveSourceDistribution(stats), [stats]);
  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const comparisonPeriod = useMemo(() => getComparisonPeriod(dateRange), [dateRange]);
  const stageFunnel = useMemo(() => deriveStageFunnel(stats, workflowStages), [stats, workflowStages]);
  const maxFunnelCount = useMemo(
    () => Math.max(1, ...stageFunnel.map((stage) => stage.count)),
    [stageFunnel],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Período:</Label>
            </div>
            <div className="flex items-center gap-2">
              <Popover modal={false}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateRange.from, "dd/MM/yyyy", { locale: pt })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateRange.from}
                    onSelect={(date) => date && setDateRange((previous) => ({ ...previous, from: startOfDay(date) }))}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground">até</span>
              <Popover modal={false}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateRange.to, "dd/MM/yyyy", { locale: pt })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateRange.to}
                    onSelect={(date) => date && setDateRange((previous) => ({ ...previous, to: date }))}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center gap-1">
              {[
                { label: "Hoje", days: 0 },
                { label: "7 dias", days: 7 },
                { label: "30 dias", days: 30 },
              ].map(({ label, days }) => {
                const now = new Date();
                const from = days === 0 ? startOfDay(now) : subDays(now, days);
                const isActive =
                  format(dateRange.from, "yyyy-MM-dd") === format(from, "yyyy-MM-dd") &&
                  format(dateRange.to, "yyyy-MM-dd") === format(now, "yyyy-MM-dd");

                return (
                  <Button
                    key={days}
                    variant={isActive ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setDateRange({ from, to: now })}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Label htmlFor="compare" className="text-sm text-muted-foreground">
                Comparar período anterior
              </Label>
              <input
                type="checkbox"
                id="compare"
                checked={compareMode}
                onChange={(event) => setCompareMode(event.target.checked)}
                className="rounded border-input"
              />
            </div>
          </div>
          {compareMode && (
            <div className="mt-2 text-xs text-muted-foreground">
              <CalendarRange className="inline h-3 w-3 mr-1" />
              Comparando com: {format(comparisonPeriod.from, "dd/MM", { locale: pt })} -{" "}
              {format(comparisonPeriod.to, "dd/MM", { locale: pt })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-1">
        <Button
          variant={dashboardView === "leads" ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => setDashboardView("leads")}
        >
          Leads
        </Button>
        <Button
          variant={dashboardView === "pipeline" ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => setDashboardView("pipeline")}
        >
          Pipeline
        </Button>
      </div>

      {renderState === "missing_query" &&
        renderPlaceholderCard(
          "Configuração do dashboard em falta",
          "O dashboard precisa de uma query scoped com orgId, scope, ids do utilizador e filtros para carregar métricas honestas.",
        )}

      {renderState === "loading" &&
        renderPlaceholderCard(
          "A carregar dashboard",
          "As métricas scoped estão a ser carregadas. Nenhum número parcial ou paginado é mostrado durante este estado.",
        )}

      {renderState === "error" && (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm font-medium">Erro ao carregar dashboard</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {error || "Não foi possível carregar as métricas scoped do dashboard."}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setRefreshTick((current) => current + 1)}
            >
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {renderState === "ready" && dashboardView === "leads" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            <KPICard
              title="Total Pipeline Ativo"
              value={formatMetricValue(kpis.totalLeads)}
              subtitle={`leads em pipeline · ${formatMetricValue(kpis.leadsToday)} hoje`}
              icon={Users}
              trend={compareMode && kpis.totalGrowth !== null && kpis.totalGrowth !== 0 ? (kpis.totalGrowth > 0 ? "up" : "down") : undefined}
              trendValue={compareMode ? kpis.totalGrowth : null}
            />
            <KPICard
              title="Novos no Período"
              value={formatMetricValue(kpis.leadsInPeriod)}
              subtitle={`leads criados · média ${formatMetricValue(kpis.avgLeadsPerDay)}/dia`}
              icon={UserPlus}
            />
            <KPICard
              title="Contactos Efectuados"
              value={formatMetricValue(kpis.totalContactAttempts)}
              subtitle="tentativas no período"
              icon={PhoneCall}
            />
            <KPICard
              title="Visitas Agendadas"
              value={formatMetricValue(kpis.visitsScheduled)}
              subtitle="no período"
              icon={CalendarCheck}
            />
            <KPICard
              title="Conversões no Período"
              value={formatMetricValue(kpis.convertedLeads)}
              subtitle="leads convertidos no período"
              icon={UserCheck}
            />
            <KPICard
              title="Taxa Conversão (coorte)"
              value={formatMetricValue(kpis.conversionRate, "%")}
              subtitle={`${formatMetricValue(kpis.cohortConversions)} dos ${formatMetricValue(kpis.leadsInPeriod)} novos converteram`}
              icon={Target}
            />
          </div>

          {Object.keys(kpis.leadsByAssignee).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Leads por Colaborador</CardTitle>
                <CardDescription>Distribuição no período selecionado</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {Object.entries(kpis.leadsByAssignee)
                    .sort((left, right) => right[1] - left[1])
                    .slice(0, 12)
                    .map(([userId, count]) => (
                      <div key={userId} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                          {count}
                        </div>
                        <span className="text-sm truncate">{userMap.get(userId)?.name || "Desconhecido"}</span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Evolução de Leads</CardTitle>
                    <CardDescription>
                      {format(dateRange.from, "dd/MM", { locale: pt })} - {format(dateRange.to, "dd/MM", { locale: pt })}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="font-normal">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    {formatMetricValue(kpis.leadsInPeriod)} no período
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  {leadsOverTime.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      Sem dados para o período selecionado.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={leadsOverTime} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--background))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="leads"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          fill="url(#colorLeads)"
                          name="Leads"
                        />
                        {compareMode && (
                          <Area
                            type="monotone"
                            dataKey="comparison"
                            stroke="hsl(var(--muted-foreground))"
                            strokeDasharray="4 4"
                            strokeWidth={2}
                            fillOpacity={0}
                            name="Período anterior"
                          />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Por Estado</CardTitle>
                <CardDescription>Distribuição atual</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[200px]">
                  {statusDistribution.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem dados.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {statusDistribution.map((entry, index) => (
                            <Cell key={`status-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--background))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mt-4 justify-center">
                  {statusDistribution.slice(0, 4).map((status, index) => (
                    <div key={index} className="flex items-center gap-1.5 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.color }} />
                      <span className="text-muted-foreground">{status.name}</span>
                      <span className="font-medium">{status.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Por Campanha</CardTitle>
                <CardDescription>Top 5 campanhas com mais leads</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  {leadsByCampaign.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem dados.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={leadsByCampaign} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={120} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--background))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                          }}
                        />
                        <Bar dataKey="leads" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Leads" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Por Origem</CardTitle>
                <CardDescription>De onde vêm os leads</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[180px]">
                  {sourceDistribution.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem dados.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={sourceDistribution} cx="50%" cy="50%" outerRadius={70} paddingAngle={2} dataKey="value">
                          {sourceDistribution.map((entry, index) => (
                            <Cell key={`source-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--background))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {sourceDistribution.map((source, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: source.color }} />
                      <span className="text-muted-foreground truncate">{source.name}</span>
                      <span className="font-semibold ml-auto">{source.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-200/50 dark:border-blue-800/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <UserPlus className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{formatMetricValue(kpis.leadsToday)}</p>
                  <p className="text-xs text-muted-foreground">Leads Hoje</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-200/50 dark:border-amber-800/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{formatMetricValue(kpis.pendingLeads)}</p>
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-200/50 dark:border-emerald-800/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <UserCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{formatMetricValue(kpis.qualifiedLeads)}</p>
                  <p className="text-xs text-muted-foreground">Qualificados</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-200/50 dark:border-purple-800/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{formatMetricValue(kpis.convertedLeads)}</p>
                  <p className="text-xs text-muted-foreground">Convertidos</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {renderState === "ready" && dashboardView === "pipeline" && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Pipeline</CardTitle>
              <CardDescription>Leads por fase do funil, na ordem configurada da organização</CardDescription>
            </CardHeader>
            <CardContent>
              {stageFunnel.length === 0 ? (
                <div className="text-sm text-muted-foreground">Sem fases de funil configuradas.</div>
              ) : (
                <div className="space-y-3">
                  {stageFunnel.map((stage) => {
                    const widthPercent = Math.max(4, Math.round((stage.count / maxFunnelCount) * 100));
                    return (
                      <div key={stage.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{stage.label}</span>
                          <span className="text-muted-foreground">{stage.count}</span>
                        </div>
                        <div className="h-3 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${widthPercent}%`, backgroundColor: stage.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Leads em Negociação</CardTitle>
              <CardDescription>
                {negotiationTotalCount > 0
                  ? `${negotiationTotalCount} lead${negotiationTotalCount === 1 ? "" : "s"} atualmente na fase de negociação`
                  : "Fase de negociação"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {negotiationLoading && negotiationRows.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">A carregar leads em negociação…</div>
              ) : negotiationQueryError ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  Não foi possível carregar os leads em negociação.
                </div>
              ) : negotiationRows.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  Sem leads em negociação de momento.
                </div>
              ) : (
                <div className="space-y-2">
                  {negotiationRows.map((row) => {
                    const identity = getIdentity(row.entity_id);
                    const assignee = row.assigned_to ? userMap.get(row.assigned_to) : null;
                    const dealValue = negotiationData?.deals.get(row.id);
                    const days = daysBetween(row.updated_at);
                    return (
                      <div
                        key={row.id}
                        className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{identity?.display_name || "Lead sem nome"}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {assignee?.name || "Sem responsável"} · há {days} {days === 1 ? "dia" : "dias"} nesta fase
                          </p>
                        </div>
                        {dealValue !== undefined && dealValue !== null && (
                          <Badge variant="secondary" className="shrink-0 font-normal">
                            {currencyFormatter.format(dealValue)}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                  {negotiationTotalCount > negotiationRows.length && (
                    <p className="text-xs text-muted-foreground text-center pt-2">
                      +{negotiationTotalCount - negotiationRows.length} mais
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Atividade Recente</CardTitle>
              <CardDescription>Chamadas, emails e notas mais recentes nos leads</CardDescription>
            </CardHeader>
            <CardContent>
              {activityLoading && activityFeedRows.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">A carregar atividade recente…</div>
              ) : activityQueryError ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  Não foi possível carregar a atividade recente.
                </div>
              ) : activityFeedRows.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  Sem atividade recente registada.
                </div>
              ) : (
                <div className="space-y-2">
                  {activityFeedRows.map((row) => {
                    const identity = getIdentity(row.entity_id);
                    const typeConfig = getActivityTypeConfig(row.interaction_type);
                    const Icon = typeConfig.icon;
                    const description = row.subject?.trim() || row.notes?.trim() || typeConfig.label;
                    return (
                      <div key={row.id} className="flex items-start gap-3 rounded-lg border px-3 py-2">
                        <div className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {identity?.display_name || "Lead sem nome"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{description}</p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(row.interaction_at), { addSuffix: true, locale: pt })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
