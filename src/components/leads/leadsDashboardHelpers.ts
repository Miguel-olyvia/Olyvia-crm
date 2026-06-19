import { differenceInDays, endOfDay, format, isValid, parseISO, startOfDay, subDays } from "date-fns";

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
  const resolvedTo = toDate(rawTo) ?? now;
  const resolvedFrom = toDate(rawFrom) ?? subDays(resolvedTo, 30);
  const to = rawTo instanceof Date ? endOfDay(resolvedTo) : resolvedTo;
  const from = rawFrom instanceof Date ? startOfDay(resolvedFrom) : resolvedFrom;

  return {
    from,
    to,
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
    p_date_from: dateRange.from.toISOString(),
    p_date_to: dateRange.to.toISOString(),
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
  const convertedLeads = readNumber(stats?.converted_in_period);
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

  const daysInRange = differenceInDays(dateRange.to, dateRange.from) + 1;
  const avgLeadsPerDay = leadsInPeriod === null ? null : roundToOneDecimal(leadsInPeriod / daysInRange);

  let conversionRate: string | null = null;
  if (leadsInPeriod && leadsInPeriod > 0 && cohortConversions !== null) {
    conversionRate = ((cohortConversions / leadsInPeriod) * 100).toFixed(1);
  }

  return {
    totalLeads,
    leadsInPeriod,
    comparisonTotal,
    totalGrowth,
    leadsToday,
    pendingLeads: readStatusCount(stats, ["pending", "new", "novo"]),
    contactedLeads: readStatusCount(stats, ["contacted", "contactado"]),
    qualifiedLeads: readStatusCount(stats, ["qualified", "qualificado"]),
    convertedLeads,
    cohortConversions,
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
