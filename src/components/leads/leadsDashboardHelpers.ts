import { differenceInDays, endOfDay, format, isValid, parseISO, startOfDay, subDays, subYears } from "date-fns";
import { pt } from "date-fns/locale";
import { getLeadScopeUserIds } from "@/pages/anewLeadsHelpers";

export type LeadsDashboardScope = "ORG" | "TEAM" | "OWNED";

export interface LeadsDashboardFilters {
  search?: string | null;
  status?: string | null;
  campaignId?: string | null;
  assignedTo?: string | null;
  contactResult?: string | null;
  source?: string | null;
  dateFrom?: Date | string | null;
  dateTo?: Date | string | null;
}

export interface LeadsDashboardQuery {
  orgId: string;
  isRoot: boolean;
  requestedScope?: LeadsDashboardScope;
  scope?: LeadsDashboardScope;
  anewUserId?: string | null;
  authUserId?: string | null;
  filters?: LeadsDashboardFilters;
}

export interface DashboardDateRange {
  from: Date;
  to: Date;
  /**
   * true when no explicit dateFrom/dateTo was chosen (e.g. on the Lista tab)
   * and this range is only a wide structural placeholder for `from`/`to`
   * (used by the calendar pickers and secondary queries below). Callers must
   * check this flag and send p_date_from/p_date_to as NULL to the RPC (and
   * skip any .gte/.lte on created_at) instead of using `from`/`to` literally
   * — see buildDashboardScopedRpcParams. Without this, the dashboard KPI
   * cards silently applied a hidden "last 30 days" default while the status
   * pills (get_lead_status_counts) already defaulted to all-time, making the
   * two disagree on the same unfiltered view.
   */
  isAllTime?: boolean;
}

export interface AvgDaysToQualify {
  sql: number | null;
  mql: number | null;
  overall: number | null;
}

export interface DashboardStats {
  active_pipeline?: number | null;
  leads_in_period?: number | null;
  leads_today?: number | null;
  contact_attempts?: number | null;
  contact_attempts_in_period?: number | null;
  visits_scheduled?: number | null;
  converted_in_period?: number | null;
  cohort_conversions?: number | null;
  status_counts?: Record<string, number> | null;
  source_counts?: Record<string, number> | null;
  campaign_counts?: Array<{ campaign_id?: string | null; campaign_name?: string | null; count: number }> | null;
  daily_counts?: Array<{ date: string; count: number }> | null;
  assigned_counts?: Record<string, number> | null;
  /** SQL/MQL classification, orthogonal to `status_counts` — see migration 20261110480000. */
  qualification_counts?: Record<string, number> | null;
  avg_days_to_qualify?: AvgDaysToQualify | null;
  /**
   * Rule-driven bucket counts from compute_lead_stage_v2 (configurable
   * per-organization pipeline stages), see migration 20261110520000.
   * Falls back to raw status_counts/converted_in_period below when absent.
   */
  resolved_stage_counts?: {
    qualified?: number;
    negotiation?: number;
    converted?: number;
    lost?: number;
  } | null;
}

export type DashboardRenderState = "missing_query" | "loading" | "error" | "ready";

export interface DashboardKpis {
  totalLeads: number | null;
  leadsInPeriod: number | null;
  comparisonTotal: number | null;
  totalGrowth: number | null;
  leadsToday: number | null;
  pendingLeads: number;
  contactedLeads: number;
  qualifiedLeads: number;
  convertedLeads: number | null;
  cohortConversions: number | null;
  conversionRate: string | null;
  totalContactAttempts: number | null;
  avgLeadsPerDay: number | null;
  leadsByAssignee: Record<string, number>;
  visitsScheduled: number | null;
}

export function resolveDashboardScope(query: LeadsDashboardQuery): LeadsDashboardScope {
  return query.requestedScope ?? query.scope ?? "ORG";
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : parseISO(value);
  return isValid(date) ? date : null;
}

export function resolveDashboardDateRange(filters?: LeadsDashboardFilters, now = new Date()): DashboardDateRange {
  const rawTo = filters?.dateTo;
  const rawFrom = filters?.dateFrom;

  if (toDate(rawFrom) === null && toDate(rawTo) === null) {
    // No date filter chosen on the Lista tab -- show everything, matching
    // the status pills (get_lead_status_counts already defaults to
    // all-time). `from`/`to` here are only a wide structural placeholder for
    // the calendar pickers; isAllTime is what callers must actually branch
    // on (RPC params, secondary .gte/.lte queries).
    return { from: startOfDay(subYears(now, 20)), to: endOfDay(now), isAllTime: true };
  }

  const resolvedTo = toDate(rawTo) ?? now;
  const resolvedFrom = toDate(rawFrom) ?? subDays(resolvedTo, 30);
  const to = rawTo instanceof Date ? endOfDay(resolvedTo) : resolvedTo;
  const from = rawFrom instanceof Date ? startOfDay(resolvedFrom) : resolvedFrom;

  return {
    from,
    to,
    isAllTime: false,
  };
}

export function getComparisonPeriod(dateRange: DashboardDateRange): DashboardDateRange {
  const days = differenceInDays(dateRange.to, dateRange.from);
  const end = subDays(startOfDay(dateRange.from), 1);
  const start = startOfDay(subDays(end, days));

  return {
    from: start,
    to: endOfDay(end),
  };
}

function normalizeFilterValue(value: string | null | undefined): string | null {
  if (!value || value === "all") return null;
  return value;
}

export function buildDashboardScopedRpcParams(query: LeadsDashboardQuery, dateRange: DashboardDateRange) {
  const filters = query.filters ?? {};
  const params: Record<string, unknown> = {
    p_org_id: query.orgId,
    p_is_root: query.isRoot,
    p_scope: resolveDashboardScope(query),
    p_anew_user_id: query.anewUserId ?? null,
    p_auth_user_id: query.authUserId ?? null,
    p_date_from: dateRange.isAllTime ? null : dateRange.from.toISOString(),
    p_date_to: dateRange.isAllTime ? null : dateRange.to.toISOString(),
  };

  const search = normalizeFilterValue(filters.search ?? null);
  if (search) params.p_search = search;

  const status = normalizeFilterValue(filters.status ?? null);
  if (status) params.p_status = status;

  const campaignId = normalizeFilterValue(filters.campaignId ?? null);
  if (campaignId) params.p_campaign_id = campaignId;

  if (filters.assignedTo === "unassigned") {
    params.p_assigned_unassigned = true;
  } else {
    const assignedTo = normalizeFilterValue(filters.assignedTo ?? null);
    if (assignedTo) params.p_assigned_to = assignedTo;
  }

  if (filters.contactResult === "none") {
    params.p_contact_result_none = true;
  } else {
    const contactResult = normalizeFilterValue(filters.contactResult ?? null);
    if (contactResult) params.p_contact_result = contactResult;
  }

  if (filters.source === "none") {
    params.p_source_is_null = true;
  } else {
    const source = normalizeFilterValue(filters.source ?? null);
    if (source) params.p_source = source;
  }

  return params;
}

function readNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function roundToOneDecimal(value: number): number {
  return Number(value.toFixed(1));
}

function readStatusCount(stats: DashboardStats | null, keys: string[]): number {
  const counts = stats?.status_counts ?? {};
  return keys.reduce((total, key) => total + (counts[key] ?? 0), 0);
}

export function deriveDashboardKpis({
  stats,
  comparisonStats,
  dateRange,
}: {
  stats: DashboardStats | null;
  comparisonStats: DashboardStats | null;
  dateRange: DashboardDateRange;
}): DashboardKpis {
  const totalLeads = readNumber(stats?.active_pipeline);
  const leadsInPeriod = readNumber(stats?.leads_in_period);
  const comparisonTotal = readNumber(comparisonStats?.leads_in_period);
  const leadsToday = readNumber(stats?.leads_today);
  // Prefer converted_in_period (matches the status pills' effective_status
  // classification exactly, always available) over resolved_stage_counts
  // (rule-driven per-org workflow-stage config via compute_lead_stage_v2) —
  // the latter can be a genuine, present value of 0 when an org's stage
  // config is misconfigured (e.g. an impossible-to-satisfy "all" condition
  // list), which `??` can't distinguish from "not computed". That silently
  // contradicted the "Won/Converted" pill (built from the same
  // effective_status as converted_in_period) showing a real non-zero count.
  // Do NOT touch lead_workflow_stages/stage_reached/compute_lead_stage_v2 —
  // out of scope, org-specific config to be fixed separately if needed.
  const convertedLeads = readNumber(stats?.converted_in_period) ?? readNumber(stats?.resolved_stage_counts?.converted);
  const cohortConversions = readNumber(stats?.cohort_conversions);
  const totalContactAttempts =
    readNumber(stats?.contact_attempts_in_period) ?? readNumber(stats?.contact_attempts);
  const visitsScheduled = readNumber(stats?.visits_scheduled);

  let totalGrowth: number | null = null;
  if (leadsInPeriod !== null && comparisonTotal !== null) {
    if (comparisonTotal === 0) {
      totalGrowth = leadsInPeriod > 0 ? 100 : 0;
    } else {
      totalGrowth = roundToOneDecimal(((leadsInPeriod - comparisonTotal) / comparisonTotal) * 100);
    }
  }

  // "Average per day" is meaningless against the all-time placeholder range
  // (from/to span ~20 years here, see resolveDashboardDateRange) — it would
  // silently render as a near-zero, misleading figure instead of the real
  // per-day rate for whatever period is actually being shown.
  const daysInRange = differenceInDays(dateRange.to, dateRange.from) + 1;
  const avgLeadsPerDay =
    leadsInPeriod === null || dateRange.isAllTime ? null : roundToOneDecimal(leadsInPeriod / daysInRange);

  // Cohort conversions require a bounded p_date_from/p_date_to (see
  // buildDashboardScopedRpcParams) — the RPC's cohort_conversions column is
  // always 0 under "Todos" (isAllTime), because "created and converted
  // within the same period" is undefined without a period. Rather than
  // showing a misleading "0 dos 5306 novos converteram" on the all-time
  // view, fall back to the unconditional converted count there — the rate
  // stops being a strict same-cohort figure in that case, but a real
  // non-zero number beats a structurally-guaranteed zero.
  const effectiveConversions = dateRange.isAllTime ? convertedLeads : cohortConversions;

  let conversionRate: string | null = null;
  if (leadsInPeriod && leadsInPeriod > 0 && effectiveConversions !== null) {
    conversionRate = ((effectiveConversions / leadsInPeriod) * 100).toFixed(1);
  }

  return {
    totalLeads,
    leadsInPeriod,
    comparisonTotal,
    totalGrowth,
    leadsToday,
    pendingLeads: readStatusCount(stats, ["pending", "new", "novo"]),
    contactedLeads: readStatusCount(stats, ["contacted", "contactado"]),
    qualifiedLeads:
      readNumber(stats?.resolved_stage_counts?.qualified) ?? readStatusCount(stats, ["qualified", "qualificado"]),
    convertedLeads,
    cohortConversions: effectiveConversions,
    conversionRate,
    totalContactAttempts,
    avgLeadsPerDay,
    leadsByAssignee: stats?.assigned_counts ?? {},
    visitsScheduled,
  };
}

export function getDashboardRenderState({
  query,
  loading,
  error,
  stats,
}: {
  query: LeadsDashboardQuery | null | undefined;
  loading: boolean;
  error: string | null;
  stats: DashboardStats | null;
}): DashboardRenderState {
  if (!query) return "missing_query";
  if (loading) return "loading";
  if (error) return "error";
  if (!stats) return "loading";
  return "ready";
}

export function getAssigneeIds(stats: DashboardStats | null): string[] {
  return Object.keys(stats?.assigned_counts ?? {}).filter((key) => key !== "unassigned");
}

export function deriveLeadsOverTime({
  stats,
  comparisonStats,
  dateRange,
  compareMode,
}: {
  stats: DashboardStats | null;
  comparisonStats: DashboardStats | null;
  dateRange: DashboardDateRange;
  compareMode: boolean;
}) {
  const days = differenceInDays(dateRange.to, dateRange.from) + 1;
  const currentByDate = new Map((stats?.daily_counts ?? []).map((entry) => [entry.date, entry.count]));
  const comparisonByDate = new Map((comparisonStats?.daily_counts ?? []).map((entry) => [entry.date, entry.count]));
  const comparisonRange = getComparisonPeriod(dateRange);

  return Array.from({ length: days }, (_, index) => {
    const currentDate = startOfDay(subDays(dateRange.to, days - index - 1));
    const comparisonDate = startOfDay(subDays(comparisonRange.to, days - index - 1));
    const item: Record<string, string | number> = {
      date: format(currentDate, "dd/MM"),
      leads: currentByDate.get(format(currentDate, "yyyy-MM-dd")) ?? 0,
    };

    if (compareMode) {
      item.comparison = comparisonByDate.get(format(comparisonDate, "yyyy-MM-dd")) ?? 0;
    }

    return item;
  });
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  new: "Pendente",
  novo: "Pendente",
  contacted: "Contactado",
  contactado: "Contactado",
  visit_scheduled: "Visita Agendada",
  visita_agendada: "Visita Agendada",
  qualified: "Qualificado",
  qualificado: "Qualificado",
  converted: "Convertido",
  convertido: "Convertido",
  no_answer: "Sem Resposta",
  sem_resposta: "Sem Resposta",
  callback_scheduled: "Callback Agendado",
  callback: "Callback Agendado",
  lost: "Perdido",
  perdido: "Perdido",
  rejected: "Rejeitado",
  rejeitado: "Rejeitado",
  incomplete: "Incompleto",
  incompleto: "Incompleto",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#eab308",
  new: "#eab308",
  novo: "#eab308",
  contacted: "#3b82f6",
  contactado: "#3b82f6",
  visit_scheduled: "#8b5cf6",
  visita_agendada: "#8b5cf6",
  qualified: "#22c55e",
  qualificado: "#22c55e",
  converted: "#10b981",
  convertido: "#10b981",
  no_answer: "#f97316",
  sem_resposta: "#f97316",
  callback_scheduled: "#06b6d4",
  callback: "#06b6d4",
  lost: "#94a3b8",
  perdido: "#94a3b8",
  rejected: "#ef4444",
  rejeitado: "#ef4444",
  incomplete: "#a3a3a3",
  incompleto: "#a3a3a3",
};

export function deriveStatusDistribution(stats: DashboardStats | null) {
  return Object.entries(stats?.status_counts ?? {})
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({
      name: STATUS_LABELS[key] ?? key,
      value,
      color: STATUS_COLORS[key] ?? "#94a3b8",
    }))
    .sort((left, right) => right.value - left.value);
}

// SQL/MQL classification is a NEW dimension, orthogonal to status_counts
// above (a lead can be "qualified"/"negotiation"/"converted" in status and
// still carry qualification_type sql/mql/null). Colors are deliberately
// distinct from STATUS_COLORS.qualified's green to avoid visual collision
// when the two are shown side by side.
export const QUALIFICATION_LABELS: Record<string, string> = {
  sql: "SQL",
  mql: "MQL",
  unclassified: "Não classificado",
};

export const QUALIFICATION_COLORS: Record<string, string> = {
  sql: "#a855f7",
  mql: "#3b82f6",
  unclassified: "#94a3b8",
};

const QUALIFICATION_KEY_ORDER = ["sql", "mql", "unclassified"];

export interface QualificationBreakdownItem {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function deriveQualificationBreakdown(stats: DashboardStats | null): QualificationBreakdownItem[] {
  const counts = stats?.qualification_counts;
  if (!counts) return [];

  return QUALIFICATION_KEY_ORDER.map((key) => ({
    key,
    label: QUALIFICATION_LABELS[key] ?? key,
    value: counts[key] ?? 0,
    color: QUALIFICATION_COLORS[key] ?? "#94a3b8",
  }));
}

export function formatDaysMetric(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)} dias`;
}

const SOURCE_LABELS: Record<string, string> = {
  public_form: "Formulário Público",
  manual: "Manual",
  api: "API",
  import: "Importação",
  unknown: "Desconhecido",
};

const SOURCE_COLORS = ["#8b5cf6", "#3b82f6", "#22c55e", "#eab308", "#ef4444", "#ec4899"];

export function deriveSourceDistribution(stats: DashboardStats | null) {
  return Object.entries(stats?.source_counts ?? {})
    .map(([name, value], index) => ({
      name: SOURCE_LABELS[name] ?? name,
      value,
      color: SOURCE_COLORS[index % SOURCE_COLORS.length],
    }))
    .sort((left, right) => right.value - left.value);
}

export function deriveCampaignDistribution(stats: DashboardStats | null) {
  return (stats?.campaign_counts ?? [])
    .map((campaign) => ({
      name: campaign.campaign_name || "Sem campanha",
      leads: campaign.count,
    }))
    .slice(0, 5);
}

export interface WorkflowStageLike {
  id: string;
  name: string;
  label: string;
  color: string;
  stage_order: number;
}

export interface StageFunnelItem {
  id: string;
  name: string;
  label: string;
  color: string;
  count: number;
}

// Same underlying stats.status_counts data used by deriveStatusDistribution,
// but ordered by the org's actual configured workflow stage_order instead of
// by count — needed to render a real pipeline funnel (new -> ... -> converted).
export function deriveStageFunnel(
  stats: DashboardStats | null,
  workflowStages: readonly WorkflowStageLike[],
): StageFunnelItem[] {
  const counts = stats?.status_counts ?? {};
  return [...workflowStages]
    .sort((left, right) => left.stage_order - right.stage_order)
    .map((stage) => ({
      id: stage.id,
      name: stage.name,
      label: stage.label,
      color: stage.color,
      count: counts[stage.name] ?? 0,
    }));
}

export interface NegotiationLeadRow {
  id: string;
  entity_id: string | null;
  assigned_to: string | null;
  updated_at: string;
  created_at: string;
}

// Mirrors the ORG/TEAM/OWNED visibility narrowing applied to the scoped RPC
// (buildDashboardScopedRpcParams) and to AnewLeads.tsx's buildLeadsBaseQuery,
// but returns a plain PostgREST .or() filter string for a direct anew_leads
// row query (the RPC only returns aggregates, not rows). Returns null for
// ORG scope, where no assignee/creator narrowing beyond organization_id applies.
export function buildNegotiationScopeFilter(
  query: LeadsDashboardQuery,
  teamMemberIds: readonly string[] = [],
): string | null {
  const scope = resolveDashboardScope(query);
  if (scope === "ORG" || !query.anewUserId) return null;

  const ids =
    scope === "OWNED"
      ? getLeadScopeUserIds(query.anewUserId, query.authUserId ?? null)
      : getLeadScopeUserIds(query.anewUserId, query.authUserId ?? null, teamMemberIds);

  return `assigned_to.in.(${ids.join(",")}),created_by.in.(${ids.join(",")})`;
}

// "Days in stage" approximation: anew_leads has no dedicated
// status_changed_at column, so updated_at is the closest available signal
// (bumped whenever the lead row changes, not exclusively on status change).
export function daysBetween(from: string | Date, now: Date = new Date()): number {
  const start = typeof from === "string" ? parseISO(from) : from;
  if (!isValid(start)) return 0;
  return Math.max(0, differenceInDays(startOfDay(now), startOfDay(start)));
}

// ── MQL -> SQL conversion rate (KPI card) ─────────────────────────────────
// Sourced from anew_entity_history rows with change_type='qualification_changed'
// (written by rpc_update_lead, see migration 20261110480000). RLS on that
// table already scopes rows via is_entity_in_user_scope, so a plain
// authenticated select naturally respects the caller's ORG/TEAM/OWNED
// visibility without extra client-side org filtering.
export interface QualificationHistoryRow {
  entity_id: string;
  new_value: string | null;
  created_at: string;
}

export interface MqlToSqlConversion {
  totalMql: number;
  convertedToSql: number;
  rate: number | null;
}

// Definition: percentage of leads whose history shows an MQL entry ever
// followed later by a SQL entry, divided by total leads ever classified MQL.
export function computeMqlToSqlConversionRate(rows: readonly QualificationHistoryRow[]): MqlToSqlConversion {
  const byEntity = new Map<string, QualificationHistoryRow[]>();
  for (const row of rows) {
    const existing = byEntity.get(row.entity_id);
    if (existing) {
      existing.push(row);
    } else {
      byEntity.set(row.entity_id, [row]);
    }
  }

  let totalMql = 0;
  let convertedToSql = 0;

  for (const entityRows of byEntity.values()) {
    const sorted = [...entityRows].sort(
      (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
    );
    const firstMqlIndex = sorted.findIndex((row) => row.new_value === "mql");
    if (firstMqlIndex === -1) continue;

    totalMql += 1;
    const hasLaterSql = sorted.slice(firstMqlIndex + 1).some((row) => row.new_value === "sql");
    if (hasLaterSql) convertedToSql += 1;
  }

  const rate = totalMql > 0 ? roundToOneDecimal((convertedToSql / totalMql) * 100) : null;
  return { totalMql, convertedToSql, rate };
}

// ── Monthly SQL vs MQL cohort trend (chart) ───────────────────────────────
// Derived client-side from anew_leads.qualified_at/qualification_type
// (RLS-scoped like the rest of anew_leads reads in this dashboard), bucketed
// by calendar month, reusing the same "yyyy-MM" grouping idea already used
// by deriveLeadsOverTime's day buckets above.
export interface QualificationLeadRow {
  qualification_type: string | null;
  qualified_at: string | null;
}

export interface MonthlyQualificationTrendPoint {
  month: string;
  monthLabel: string;
  sql: number;
  mql: number;
}

export function deriveMonthlyQualificationTrend(
  rows: readonly QualificationLeadRow[],
): MonthlyQualificationTrendPoint[] {
  const byMonth = new Map<string, { sql: number; mql: number }>();

  for (const row of rows) {
    if (!row.qualified_at || (row.qualification_type !== "sql" && row.qualification_type !== "mql")) continue;
    const date = parseISO(row.qualified_at);
    if (!isValid(date)) continue;

    const monthKey = format(date, "yyyy-MM");
    const bucket = byMonth.get(monthKey) ?? { sql: 0, mql: 0 };
    if (row.qualification_type === "sql") bucket.sql += 1;
    else bucket.mql += 1;
    byMonth.set(monthKey, bucket);
  }

  return Array.from(byMonth.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([monthKey, counts]) => ({
      month: monthKey,
      monthLabel: format(parseISO(`${monthKey}-01`), "MMM/yy", { locale: pt }),
      ...counts,
    }));
}
