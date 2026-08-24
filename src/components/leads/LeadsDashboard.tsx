import { useEffect, useMemo, useRef, useState } from "react";
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
  X,
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
  computeMqlToSqlConversionRate,
  daysBetween,
  deriveCampaignDistribution,
  deriveDashboardKpis,
  deriveLeadsOverTime,
  deriveMonthlyQualificationTrend,
  deriveQualificationBreakdown,
  deriveSourceDistribution,
  deriveStageFunnel,
  deriveStatusDistribution,
  formatDaysMetric,
  QUALIFICATION_COLORS,
  getAssigneeIds,
  getComparisonPeriod,
  getDashboardRenderState,
  resolveDashboardDateRange,
  resolveDashboardScope,
  type DashboardStats,
  type LeadsDashboardQuery,
  type NegotiationLeadRow,
  type QualificationHistoryRow,
  type QualificationLeadRow,
} from "./leadsDashboardHelpers";
import { LeadsDashboardAIReport } from "./LeadsDashboardAIReport";

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
  /**
   * Same statusFilter/statusCounts pair AnewLeads.tsx already uses to drive
   * the List tab's "Quick Status Cards" (statusCounts comes from the
   * get_lead_status_counts RPC, unaffected by statusFilter itself). Reused
   * here instead of introducing a second, parallel filter mechanism:
   * statusFilter already flows into `query.filters.status` ->
   * buildDashboardScopedRpcParams -> get_lead_dashboard_stats_scoped's
   * p_status param, so selecting a pill here already re-filters every KPI,
   * chart and the qualification section below via the existing stats fetch.
   */
  statusFilter?: string;
  onStatusFilterChange?: (status: string) => void;
  statusCounts?: Record<string, number>;
  /**
   * Gates the AI performance report card (LeadsDashboardAIReport) rendered at
   * the bottom of the "leads" sub-view. Mirrors the caller-gated prop pattern
   * from the sibling Lovable-connected repo, where a separate v1/v2 flag
   * controlled this — this repo has no v1/v2 split, so the caller
   * (AnewLeads.tsx) simply passes `true` unconditionally. Defaults to false
   * so existing/other callers of LeadsDashboard don't get the card for free.
   */
  enableAIReport?: boolean;
}

const ALL_STATUS_FILTER = "all";

interface StatusPill {
  key: string;
  label: string;
  color: string;
  count: number;
}

/**
 * Builds the pill list from the org's real configured workflow stages (the
 * same dynamic-stage source already used for the List tab's Quick Status
 * Cards in AnewLeads.tsx), not a hardcoded status list — so a customized
 * org's funnel is reflected correctly here too.
 */
function buildStatusPills(workflowStages: WorkflowStage[], statusCounts: Record<string, number>): StatusPill[] {
  return [...workflowStages]
    .sort((left, right) => left.stage_order - right.stage_order)
    .map((stage) => ({
      key: stage.name,
      label: stage.label,
      color: stage.color,
      count: statusCounts[stage.name] ?? 0,
    }));
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
  const {
    query,
    workflowStages,
    teamMemberIds,
    statusFilter,
    onStatusFilterChange,
    statusCounts,
    enableAIReport = false,
  } = props;
  const { getIdentity, resolveEntities } = useEntityIdentity();
  const [dateRange, setDateRange] = useState(() => resolveDashboardDateRange(query?.filters));
  const [compareMode, setCompareMode] = useState(false);
  const [dashboardView, setDashboardView] = useState<"leads" | "pipeline">("leads");
  // Period picker and the Leads/Pipeline switch are hidden by default so the
  // Dashboard tab opens straight into the status pills + KPI cards (matching
  // the reference design). Both stay reachable via the small icon triggers
  // rendered above the pill bar.
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [comparisonStats, setComparisonStats] = useState<DashboardStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  /**
   * Drill-down for the "Leads por Colaborador" chips below. Mirrors the
   * statusFilter pill mechanism above (same additive-override approach), but
   * kept as local state here instead of a caller-controlled prop since no
   * parent currently needs to observe/persist this selection: it is applied
   * on top of buildDashboardScopedRpcParams' own p_assigned_to (already
   * derived from query.filters.assignedTo) right before the RPC call, and
   * cleared by clicking the same chip again.
   */
  const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null);

  // Monotonically increasing id for the in-flight loadStats request below.
  // Toggling the assignee chip quickly (select -> deselect) fires two
  // overlapping RPC round-trips; without this guard, whichever one happens
  // to resolve LAST wins the final setStats/setComparisonStats call -- even
  // when it's the stale, now-superseded (filtered) request completing after
  // the newer (unfiltered) one already rendered correctly. Same pattern as
  // EntitySearchInput's latestRequestIdRef.
  const latestStatsRequestIdRef = useRef(0);

  useEffect(() => {
    setDateRange(resolveDashboardDateRange(query?.filters));
  }, [query?.orgId, query?.filters?.dateFrom, query?.filters?.dateTo]);

  // Reset the local drill-down whenever the underlying scoped query changes
  // (org switch, scope switch, or a new caller-driven filter set), so a
  // stale assignee selection never silently narrows a different query.
  useEffect(() => {
    setSelectedAssignee(null);
  }, [query?.orgId, query?.filters]);

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
      // Claim this call as the latest. Any earlier call that resolves after
      // this point will see its own id no longer match latestStatsRequestIdRef
      // and must not touch state (see guards below).
      const requestId = ++latestStatsRequestIdRef.current;

      setLoading(true);
      setError(null);

      try {
        // Chip drill-down override: applied on top of buildDashboardScopedRpcParams'
        // own p_assigned_to/p_assigned_unassigned (derived from query.filters.assignedTo),
        // same additive pattern as the statusFilter pill above -- p_status flows in via
        // query.filters.status there, this narrows further by assignee without a second
        // parallel query mechanism.
        const withAssigneeOverride = (params: Record<string, unknown>) => {
          if (!selectedAssignee) return params;
          const { p_assigned_unassigned, ...rest } = params;
          return { ...rest, p_assigned_to: selectedAssignee };
        };

        const mainParams = {
          ...withAssigneeOverride(buildDashboardScopedRpcParams(query, dateRange)),
          p_compare_previous: false,
        };
        // No "previous period" makes sense when showing all-time data.
        const comparisonRange = compareMode && !dateRange.isAllTime ? getComparisonPeriod(dateRange) : null;
        const [mainResult, comparisonResult] = await Promise.all([
          (supabase.rpc as any)("get_lead_dashboard_stats_scoped", mainParams).abortSignal(abortController.signal),
          compareMode && comparisonRange
            ? (supabase.rpc as any)("get_lead_dashboard_stats_scoped", {
                ...withAssigneeOverride(buildDashboardScopedRpcParams(query, comparisonRange)),
                p_compare_previous: false,
              }).abortSignal(abortController.signal)
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (mainResult?.error) throw new Error(mainResult.error.message || "Erro ao carregar dashboard.");
        if (comparisonResult?.error) {
          throw new Error(comparisonResult.error.message || "Erro ao carregar comparação do dashboard.");
        }

        if (!cancelled && requestId === latestStatsRequestIdRef.current) {
          setStats((mainResult?.data as DashboardStats | null) ?? null);
          setComparisonStats((comparisonResult?.data as DashboardStats | null) ?? null);
        }
      } catch (loadError) {
        if (cancelled || abortController.signal.aborted) return;
        if (requestId !== latestStatsRequestIdRef.current) return;
        const message = loadError instanceof Error ? loadError.message : "Erro ao carregar dashboard.";
        console.error("Error loading scoped lead dashboard stats:", loadError);
        setStats(null);
        setComparisonStats(null);
        setUsers([]);
        setError(message);
      } finally {
        if (!cancelled && requestId === latestStatsRequestIdRef.current) {
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
    selectedAssignee,
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
      dateRange.from.toISOString(),
      dateRange.to.toISOString(),
    ],
    queryFn: async () => {
      if (!query) return { rows: [] as NegotiationLeadRow[], totalCount: 0, deals: new Map<string, number>() };

      // Filtered by the same created_at date range the stage funnel above uses
      // (get_lead_dashboard_stats_scoped's p_date_from/p_date_to), so this list's
      // count always matches the "Negotiation" bar in the funnel instead of
      // silently showing a different, unscoped total for the same metric.
      let negotiationQuery = supabase
        .from("anew_leads")
        .select("id, entity_id, assigned_to, updated_at, created_at", { count: "exact" })
        .eq("organization_id", query.orgId)
        .eq("status", "negotiation")
        .is("deleted_at", null)
        .order("updated_at", { ascending: true })
        .order("id", { ascending: true })
        .range(0, NEGOTIATION_LIST_LIMIT - 1);

      if (!dateRange.isAllTime) {
        negotiationQuery = negotiationQuery
          .gte("created_at", dateRange.from.toISOString())
          .lte("created_at", dateRange.to.toISOString());
      }

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

  // Memoized (not `negotiationData?.rows ?? []`): the `?? []` fallback creates
  // a brand-new array reference on every render whenever negotiationData is
  // undefined (the permanent state in the default "Leads" sub-view, since
  // this query is gated to dashboardView === "pipeline"). That fresh
  // reference fed straight into a useEffect dependency array below, which
  // unconditionally called setUsers([]) every time -- an infinite render
  // loop, since a new [] is never Object.is-equal to the previous state.
  const negotiationRows = useMemo(() => negotiationData?.rows ?? [], [negotiationData]);
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

  // Memoized for the same reason as negotiationRows above -- see that comment.
  const activityFeedRows = useMemo(() => activityRows ?? [], [activityRows]);

  // MQL -> SQL conversion KPI: sourced from anew_entity_history's dedicated
  // qualification_changed feed (see migration 20261110480000), not from the
  // scoped RPC. RLS on anew_entity_history (is_entity_in_user_scope) already
  // narrows visibility for the caller, so no extra org/scope filter is added
  // here beyond the change_type + period filters.
  const {
    data: qualificationHistoryRows,
    isLoading: qualificationHistoryLoading,
  } = useQuery({
    queryKey: [
      "leads-dashboard-qualification-history",
      query?.orgId,
      dateRange.from.toISOString(),
      dateRange.to.toISOString(),
    ],
    queryFn: async (): Promise<QualificationHistoryRow[]> => {
      if (!query) return [];

      let historyQuery = supabase
        .from("anew_entity_history")
        .select("entity_id, new_value, created_at")
        .eq("change_type", "qualification_changed")
        .order("created_at", { ascending: true });

      if (!dateRange.isAllTime) {
        historyQuery = historyQuery
          .gte("created_at", dateRange.from.toISOString())
          .lte("created_at", dateRange.to.toISOString());
      }

      const { data, error: historyError } = await historyQuery;

      if (historyError) {
        throw new Error(historyError.message || "Erro ao carregar histórico de qualificação.");
      }

      return (data ?? []) as QualificationHistoryRow[];
    },
    enabled: !!query && dashboardView === "leads",
    staleTime: 60_000,
  });

  const mqlToSqlConversion = useMemo(
    () => computeMqlToSqlConversionRate(qualificationHistoryRows ?? []),
    [qualificationHistoryRows],
  );

  // Monthly SQL vs MQL cohort trend: derived client-side from anew_leads
  // (qualification_type/qualified_at), scoped the same way as the
  // negotiation-leads query above (buildNegotiationScopeFilter), since the
  // scoped RPC does not return a monthly breakdown of qualification.
  const {
    data: qualificationTrendRows,
    isLoading: qualificationTrendLoading,
  } = useQuery({
    queryKey: [
      "leads-dashboard-qualification-trend",
      query?.orgId,
      negotiationScope,
      query?.anewUserId,
      query?.authUserId,
      teamMemberIdsKey,
    ],
    queryFn: async (): Promise<QualificationLeadRow[]> => {
      if (!query) return [];

      let trendQuery = supabase
        .from("anew_leads")
        .select("qualification_type, qualified_at")
        .eq("organization_id", query.orgId)
        .is("deleted_at", null)
        .not("qualified_at", "is", null)
        .order("qualified_at", { ascending: true });

      const scopeFilter = buildNegotiationScopeFilter(query, teamMemberIds ?? []);
      if (scopeFilter) {
        trendQuery = trendQuery.or(scopeFilter);
      }

      const { data, error: trendError } = await trendQuery;
      if (trendError) {
        throw new Error(trendError.message || "Erro ao carregar tendência de qualificação.");
      }

      return (data ?? []) as QualificationLeadRow[];
    },
    enabled: !!query && dashboardView === "leads",
    staleTime: 60_000,
  });

  const qualificationTrend = useMemo(
    () => deriveMonthlyQualificationTrend(qualificationTrendRows ?? []),
    [qualificationTrendRows],
  );

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
  const qualificationBreakdown = useMemo(() => deriveQualificationBreakdown(stats), [stats]);
  const qualificationBreakdownTotal = useMemo(
    () => qualificationBreakdown.reduce((sum, entry) => sum + entry.value, 0),
    [qualificationBreakdown],
  );
  const qualificationBreakdownByKey = useMemo(
    () => new Map(qualificationBreakdown.map((entry) => [entry.key, entry])),
    [qualificationBreakdown],
  );
  const qualificationPercent = (key: string): number | null => {
    if (qualificationBreakdownTotal === 0) return null;
    const entry = qualificationBreakdownByKey.get(key);
    if (!entry) return null;
    return Math.round((entry.value / qualificationBreakdownTotal) * 100);
  };
  const leadsByCampaign = useMemo(() => deriveCampaignDistribution(stats), [stats]);
  const sourceDistribution = useMemo(() => deriveSourceDistribution(stats), [stats]);
  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const comparisonPeriod = useMemo(() => getComparisonPeriod(dateRange), [dateRange]);
  const stageFunnel = useMemo(() => deriveStageFunnel(stats, workflowStages), [stats, workflowStages]);
  const maxFunnelCount = useMemo(
    () => Math.max(1, ...stageFunnel.map((stage) => stage.count)),
    [stageFunnel],
  );

  const activeStatusFilter = statusFilter ?? ALL_STATUS_FILTER;
  const statusPills = useMemo(
    () => buildStatusPills(workflowStages, statusCounts ?? {}),
    [workflowStages, statusCounts],
  );
  const totalStatusCount = useMemo(
    () => Object.values(statusCounts ?? {}).reduce((sum, count) => sum + count, 0),
    [statusCounts],
  );
  const handleStatusPillClick = (status: string) => {
    if (!onStatusFilterChange) return;
    onStatusFilterChange(status === activeStatusFilter ? ALL_STATUS_FILTER : status);
  };

  // Same toggle-on-second-click pattern as handleStatusPillClick above.
  const handleAssigneeChipClick = (userId: string) => {
    setSelectedAssignee((current) => (current === userId ? null : userId));
  };

  const showStatusPills = dashboardView === "leads" && !!onStatusFilterChange && statusPills.length > 0;

  // AI report data — reuses the KPIs/evolution/statusDistribution already
  // computed above instead of fetching anything twice. See
  // supabase/functions/leads-dashboard-ai-report/index.ts's PayloadSchema for
  // the exact request contract these are shaped to match.
  const aiReportTopAssignees = useMemo(
    () =>
      Object.entries(kpis.leadsByAssignee)
        .map(([userId, count]) => ({ name: userMap.get(userId)?.name || "Desconhecido", count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 20),
    [kpis.leadsByAssignee, userMap],
  );
  const aiReportEvolution = useMemo(
    () => leadsOverTime.map((point) => ({ date: point.date, leads: point.leads })),
    [leadsOverTime],
  );
  const aiReportStatusDistribution = useMemo(
    () => statusDistribution.map((entry) => ({ name: entry.name, value: entry.value })),
    [statusDistribution],
  );
  const aiReportPeriodLabel = dateRange.isAllTime
    ? "Todos os períodos"
    : `${format(dateRange.from, "dd/MM/yyyy", { locale: pt })} - ${format(
        dateRange.to,
        "dd/MM/yyyy",
        { locale: pt },
      )}`;
  const aiReportAssigneeName = selectedAssignee ? userMap.get(selectedAssignee)?.name ?? null : null;
  const aiReportKpis = useMemo(
    () => ({
      totalLeads: kpis.totalLeads ?? 0,
      leadsInPeriod: kpis.leadsInPeriod ?? 0,
      leadsToday: kpis.leadsToday ?? 0,
      pendingLeads: kpis.pendingLeads,
      contactedLeads: kpis.contactedLeads,
      qualifiedLeads: kpis.qualifiedLeads,
      convertedLeads: kpis.convertedLeads ?? 0,
      cohortConversions: kpis.cohortConversions ?? 0,
      conversionRate: kpis.conversionRate ?? 0,
      avgLeadsPerDay: kpis.avgLeadsPerDay ?? 0,
      visitsScheduled: kpis.visitsScheduled ?? 0,
      totalGrowth: kpis.totalGrowth ?? undefined,
    }),
    [kpis],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div
          className={`flex min-w-0 flex-1 flex-wrap items-center gap-2 ${
            showStatusPills ? "rounded-lg border bg-card p-3" : ""
          }`}
        >
          {showStatusPills && (
            <>
              <span className="text-sm font-medium text-muted-foreground shrink-0">Status:</span>
              <button
                type="button"
                onClick={() => onStatusFilterChange(ALL_STATUS_FILTER)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeStatusFilter === ALL_STATUS_FILTER
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-input bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                Todos
                <span
                  className={`rounded-full px-1.5 text-[11px] ${
                    activeStatusFilter === ALL_STATUS_FILTER ? "bg-primary-foreground/20" : "bg-muted"
                  }`}
                >
                  {totalStatusCount}
                </span>
              </button>
              {statusPills.map((pill) => {
                const isActive = activeStatusFilter === pill.key;
                return (
                  <button
                    key={pill.key}
                    type="button"
                    onClick={() => handleStatusPillClick(pill.key)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? "border-transparent text-white"
                        : "border-input bg-background text-muted-foreground hover:bg-muted"
                    }`}
                    style={isActive ? { backgroundColor: pill.color } : undefined}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: isActive ? "currentColor" : pill.color }}
                    />
                    {pill.label}
                    <span className={`rounded-full px-1.5 text-[11px] ${isActive ? "bg-white/20" : "bg-muted"}`}>
                      {pill.count}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>

      {isFiltersOpen && (
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
                      {dateRange.isAllTime ? "Todos" : format(dateRange.from, "dd/MM/yyyy", { locale: pt })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateRange.isAllTime ? undefined : dateRange.from}
                      onSelect={(date) =>
                        date && setDateRange((previous) => ({ ...previous, from: startOfDay(date), isAllTime: false }))
                      }
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
                      {dateRange.isAllTime ? "Todos" : format(dateRange.to, "dd/MM/yyyy", { locale: pt })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateRange.isAllTime ? undefined : dateRange.to}
                      onSelect={(date) =>
                        date && setDateRange((previous) => ({ ...previous, to: date, isAllTime: false }))
                      }
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant={dateRange.isAllTime ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setDateRange(resolveDashboardDateRange(undefined))}
                >
                  Tudo
                </Button>
                {[
                  { label: "Hoje", days: 0 },
                  { label: "7 dias", days: 7 },
                  { label: "30 dias", days: 30 },
                ].map(({ label, days }) => {
                  const now = new Date();
                  const from = days === 0 ? startOfDay(now) : subDays(now, days);
                  const isActive =
                    !dateRange.isAllTime &&
                    format(dateRange.from, "yyyy-MM-dd") === format(from, "yyyy-MM-dd") &&
                    format(dateRange.to, "yyyy-MM-dd") === format(now, "yyyy-MM-dd");

                  return (
                    <Button
                      key={days}
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setDateRange({ from, to: now, isAllTime: false })}
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Label
                  htmlFor="compare"
                  className={`text-sm ${dateRange.isAllTime ? "text-muted-foreground/50" : "text-muted-foreground"}`}
                  title={dateRange.isAllTime ? "Não aplicável a 'Todos os períodos'" : undefined}
                >
                  Comparar período anterior
                </Label>
                <input
                  type="checkbox"
                  id="compare"
                  checked={compareMode && !dateRange.isAllTime}
                  disabled={dateRange.isAllTime}
                  onChange={(event) => setCompareMode(event.target.checked)}
                  className="rounded border-input disabled:opacity-50"
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
      )}

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <KPICard
              title="Pipeline Ativo no Período"
              value={formatMetricValue(kpis.totalLeads)}
              subtitle={`leads em pipeline no período · ${formatMetricValue(kpis.leadsToday)} hoje`}
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
              title={dateRange.isAllTime ? "Taxa de Conversão" : "Taxa Conversão (coorte)"}
              value={formatMetricValue(kpis.conversionRate, "%")}
              subtitle={`${formatMetricValue(kpis.cohortConversions)} dos ${formatMetricValue(kpis.leadsInPeriod)} novos converteram`}
              icon={Target}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Qualificação de Leads</CardTitle>
              <CardDescription>
                Distribuição SQL / MQL do período, tempo médio até qualificar e taxa de conversão
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${QUALIFICATION_COLORS.sql}1a` }}
                    >
                      <Target className="h-4 w-4" style={{ color: QUALIFICATION_COLORS.sql }} />
                    </div>
                    <p className="text-sm font-medium">SQL (Sales Qualified)</p>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: QUALIFICATION_COLORS.sql }}>
                    {formatMetricValue(qualificationBreakdownByKey.get("sql")?.value ?? 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatMetricValue(qualificationPercent("sql"), "%")} do total qualificado ·{" "}
                    {formatDaysMetric(stats?.avg_days_to_qualify?.sql)} em média
                  </p>
                </div>

                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${QUALIFICATION_COLORS.mql}1a` }}
                    >
                      <UserCheck className="h-4 w-4" style={{ color: QUALIFICATION_COLORS.mql }} />
                    </div>
                    <p className="text-sm font-medium">MQL (Marketing Qualified)</p>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: QUALIFICATION_COLORS.mql }}>
                    {formatMetricValue(qualificationBreakdownByKey.get("mql")?.value ?? 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatMetricValue(qualificationPercent("mql"), "%")} do total qualificado ·{" "}
                    {formatDaysMetric(stats?.avg_days_to_qualify?.mql)} em média
                  </p>
                </div>

                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${QUALIFICATION_COLORS.unclassified}1a` }}
                    >
                      <Users className="h-4 w-4" style={{ color: QUALIFICATION_COLORS.unclassified }} />
                    </div>
                    <p className="text-sm font-medium">Não classificado</p>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: QUALIFICATION_COLORS.unclassified }}>
                    {formatMetricValue(qualificationBreakdownByKey.get("unclassified")?.value ?? 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatMetricValue(qualificationPercent("unclassified"), "%")} do total qualificado
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Zap className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Taxa de conversão MQL → SQL</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {mqlToSqlConversion.totalMql > 0
                      ? `${mqlToSqlConversion.convertedToSql} de ${mqlToSqlConversion.totalMql} MQL viraram SQL`
                      : "Sem leads MQL no período"}
                  </p>
                </div>
                <p className="text-xl font-bold text-primary shrink-0">
                  {qualificationHistoryLoading
                    ? "--"
                    : formatMetricValue(mqlToSqlConversion.rate === null ? null : mqlToSqlConversion.rate, "%")}
                </p>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Tendência mensal SQL vs MQL</p>
                <div className="h-[140px]">
                  {qualificationTrendLoading && qualificationTrend.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      A carregar tendência…
                    </div>
                  ) : qualificationTrend.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      Sem dados de qualificação para o período.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={qualificationTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--background))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                          }}
                        />
                        <Bar dataKey="sql" stackId="qualification" fill={QUALIFICATION_COLORS.sql} name="SQL" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="mql" stackId="qualification" fill={QUALIFICATION_COLORS.mql} name="MQL" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {Object.keys(kpis.leadsByAssignee).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Leads por Colaborador</CardTitle>
                <CardDescription>
                  Distribuição no período selecionado · clique num colaborador para filtrar o dashboard
                </CardDescription>
                {selectedAssignee && (
                  <div className="pt-1">
                    <Badge variant="secondary" className="gap-1 pr-1">
                      <span>Filtrado por: {userMap.get(selectedAssignee)?.name || "Desconhecido"}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 hover:bg-transparent"
                        onClick={() => setSelectedAssignee(null)}
                        aria-label="Limpar filtro de colaborador"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {Object.entries(kpis.leadsByAssignee)
                    .sort((left, right) => right[1] - left[1])
                    .slice(0, 12)
                    .map(([userId, count]) => {
                      const isSelected = selectedAssignee === userId;
                      return (
                        <button
                          key={userId}
                          type="button"
                          onClick={() => handleAssigneeChipClick(userId)}
                          aria-pressed={isSelected}
                          className={`flex items-center gap-2 rounded-lg p-2 text-left transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-primary/10 ring-2 ring-primary shadow-md"
                              : "bg-muted/50 hover:bg-muted"
                          }`}
                        >
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0">
                            {count}
                          </div>
                          <span className="text-sm truncate">{userMap.get(userId)?.name || "Desconhecido"}</span>
                        </button>
                      );
                    })}
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
                      {dateRange.isAllTime
                        ? "Todos os períodos"
                        : `${format(dateRange.from, "dd/MM", { locale: pt })} - ${format(dateRange.to, "dd/MM", { locale: pt })}`}
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

          {enableAIReport && (
            <LeadsDashboardAIReport
              organizationId={query?.orgId}
              periodLabel={aiReportPeriodLabel}
              periodMode="range"
              assigneeName={aiReportAssigneeName}
              kpis={aiReportKpis}
              topAssignees={aiReportTopAssignees}
              evolution={aiReportEvolution}
              statusDistribution={aiReportStatusDistribution}
            />
          )}
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
