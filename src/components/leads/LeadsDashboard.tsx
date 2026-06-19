import { useEffect, useMemo, useState } from "react";
import { format, startOfDay, subDays } from "date-fns";
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
  PhoneCall,
  Target,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  buildDashboardScopedRpcParams,
  deriveCampaignDistribution,
  deriveDashboardKpis,
  deriveLeadsOverTime,
  deriveSourceDistribution,
  deriveStatusDistribution,
  getAssigneeIds,
  getComparisonPeriod,
  getDashboardRenderState,
  resolveDashboardDateRange,
  type DashboardStats,
  type LeadsDashboardQuery,
} from "./leadsDashboardHelpers";

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
  const { query } = props;
  const [dateRange, setDateRange] = useState(() => resolveDashboardDateRange(query?.filters));
  const [compareMode, setCompareMode] = useState(false);
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

  useEffect(() => {
    const assigneeIds = getAssigneeIds(stats);
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
  }, [query, stats]);

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

      {renderState === "ready" && (
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
    </div>
  );
}
