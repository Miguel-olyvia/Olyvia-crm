import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  UserPlus, 
  UserCheck, 
  Target,
  Clock,
  Calendar as CalendarIcon,
  PhoneCall,
  Mail,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  BarChart3,
  CalendarRange,
  Phone,
  MessageSquare,
  CalendarCheck,
  UserX,
  Filter
} from "lucide-react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
  LineChart,
  Line
} from "recharts";
import { format, subDays, startOfDay, endOfDay, isAfter, isBefore, parseISO, differenceInDays, addDays } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface Lead {
  id: string;
  status: string;
  source: string | null;
  created_at: string;
  campaign_id: string | null;
  campaigns?: { id: string; name: string } | null;
  last_contact_result?: string;
  last_contact_at?: string | null;
  converted_at: string | null;
  assigned_to?: string | null;
  contact_attempts?: number;
  scheduled_visit_id?: string | null;
}

// --- Normalize & Effective Status logic (replicated from AnewLeads) ---
function normalizeStatusToken(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '_')
    .trim();
}

function isVisitScheduledValue(val: string | null | undefined): boolean {
  if (!val) return false;
  const t = normalizeStatusToken(val);
  return t === 'visit_scheduled' || t === 'visita_agendada' || t.includes('visit_scheduled') || t.includes('visita_agendada');
}

function getEffectiveStatus(
  lead: Lead,
  workflowStages: WorkflowStage[],
  visitScheduledResultIds: Set<string>
): string {
  // 1. If converted → converted (highest priority, aligns with SQL CASE)
  if (lead.converted_at) return 'converted';
  // 2. If has scheduled_visit_id → visit_scheduled
  if (lead.scheduled_visit_id) return 'visit_scheduled';
  // 3. If last_contact_result is a known visit-scheduled UUID
  if (visitScheduledResultIds.has(lead.last_contact_result || '')) return 'visit_scheduled';
  // 4. If last_contact_result signals visit scheduled by token
  if (isVisitScheduledValue(lead.last_contact_result)) return 'visit_scheduled';
  // 5. If raw status matches visit scheduled
  if (isVisitScheduledValue(lead.status)) return 'visit_scheduled';
  // 6. Try to map to a workflow stage keyword
  const token = normalizeStatusToken(lead.status);
  // Check if status is a stage id (UUID)
  const stageById = workflowStages.find(s => s.id === lead.status || s.name === lead.status);
  if (stageById) {
    const stageToken = normalizeStatusToken(stageById.name);
    if (stageToken.includes('qualif')) return 'qualified';
    if (stageToken.includes('contact')) return 'contacted';
    if (stageToken.includes('visit') || stageToken.includes('visita')) return 'visit_scheduled';
    // First stage = pending
    const sorted = [...workflowStages].sort((a, b) => a.stage_order - b.stage_order);
    if (sorted.length > 0 && sorted[0].id === stageById.id) return 'pending';
  }
  // Keyword matching on raw token
  if (token.includes('qualif')) return 'qualified';
  if (token.includes('contact')) return 'contacted';
  if (token === 'new' || token === 'novo' || token === 'nova') return 'pending';
  // If contact_attempts > 0 treat as contacted
  if (lead.contact_attempts && lead.contact_attempts > 0) return 'contacted';
  // Fallback: check if it's the first workflow stage
  const sorted = [...workflowStages].sort((a, b) => a.stage_order - b.stage_order);
  if (sorted.length > 0 && (lead.status === sorted[0].id || lead.status === sorted[0].name)) return 'pending';
  return token || 'pending';
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

interface ContactHistory {
  id: string;
  lead_id: string;
  contacted_at: string;
  contacted_by: string;
  result: string;
}

interface User {
  id: string;
  name: string | null;
  email: string;
}

interface LeadsDashboardProps {
  leads: Lead[];
  workflowStages: WorkflowStage[];
  campaigns: Campaign[];
  companyId?: string | null;
}

export function LeadsDashboard({ leads: _passedLeads, workflowStages, campaigns, companyId }: LeadsDashboardProps) {
  // Date filter state
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date()
  });
  const [compareMode, setCompareMode] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [contactHistoryCount, setContactHistoryCount] = useState(0);
  const [contactHistory, setContactHistory] = useState<ContactHistory[]>([]);
  const [scheduleItems, setScheduleItems] = useState<any[]>([]);
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [visitScheduledResultIds, setVisitScheduledResultIds] = useState<Set<string>>(new Set());

  // Fetch dashboard stats via RPC instead of loading all leads
  useEffect(() => {
    if (companyId) {
      loadDashboardStats();
      loadVisitScheduledResultIds();
    }
  }, [companyId, dateRange]);

  const loadDashboardStats = async () => {
    if (!companyId) return;
    setLoadingStats(true);
    try {
      const { data, error } = await (supabase as any).rpc('get_lead_dashboard_stats', {
        p_org_id: companyId,
        p_date_from: dateRange.from.toISOString(),
        p_date_to: dateRange.to.toISOString(),
      });
      if (error) {
        console.error("Error loading dashboard stats:", error);
      } else {
        setDashboardStats(data);
      }
    } catch (error) {
      console.error("Error loading dashboard stats:", error);
    }
    setLoadingStats(false);
  };

  const loadVisitScheduledResultIds = async () => {
    if (!companyId) return;

    const { data, error } = await supabase
      .from("lead_contact_results")
      .select("id, name")
      .or(`organization_id.is.null,organization_id.eq.${companyId}`)
      .eq("is_active", true);

    if (error) {
      console.error("Error loading lead contact results:", error);
      return;
    }

    const nextIds = new Set(
      (data || [])
        .filter((r: any) => isVisitScheduledValue(r?.name) || isVisitScheduledValue(r?.id))
        .map((r: any) => r.id)
        .filter(Boolean)
    );

    setVisitScheduledResultIds(nextIds);
  };

  // Use passed leads as fallback while stats load
  const leads = _passedLeads;

  // Auto-refresh every 5 minutes (was 60s — too aggressive)
  useEffect(() => {
    if (!companyId) return;
    const interval = setInterval(() => {
      loadDashboardStats();
      loadContactHistory();
      loadScheduleItems();
    }, 300000);
    return () => clearInterval(interval);
  }, [companyId, dateRange]);

  // Load users once (not on dateRange change - they don't change)
  useEffect(() => {
    if (companyId) {
      loadUsers();
    }
  }, [companyId]);

  // Load date-dependent data
  useEffect(() => {
    if (companyId) {
      loadContactHistory();
      loadScheduleItems();
    }
  }, [companyId, dateRange]);

  const loadUsers = async () => {
    try {
      if (!companyId) return;
      // Get active members from anew_memberships
      const { data: memberships } = await supabase
        .from("anew_memberships")
        .select("user_id")
        .eq("organization_id", companyId)
        .eq("status", "active");

      const userIds = [...new Set((memberships || []).map(m => m.user_id))];
      if (userIds.length === 0) { setUsers([]); return; }

      const { data: usersData } = await supabase
        .from("anew_users")
        .select("id, name")
        .in("id", userIds);

      if (usersData) {
        setUsers(usersData.map((u: any) => ({ id: u.id, name: u.name || '', email: '' })));
      }
    } catch (error) {
      console.error("Error loading users:", error);
    }
  };

  const loadContactHistory = async () => {
    if (!companyId) return;
    // Use count to avoid 1000-row limit, then load details for charts
    const { count } = await (supabase as any)
      .from("lead_contact_history")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", companyId)
      .gte("contacted_at", dateRange.from.toISOString())
      .lte("contacted_at", dateRange.to.toISOString());
    
    setContactHistoryCount(count || 0);

    // Load details for result breakdown (limited sample)
    const { data } = await (supabase as any)
      .from("lead_contact_history")
      .select("id, lead_id, contacted_at, contacted_by, result")
      .eq("organization_id", companyId)
      .gte("contacted_at", dateRange.from.toISOString())
      .lte("contacted_at", dateRange.to.toISOString())
      .order("contacted_at", { ascending: false })
      .limit(500);
    if (data) setContactHistory(data);
  };

  const loadScheduleItems = async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from("schedule_items")
      .select("id, title, start_datetime, status, created_by, board_id")
      .eq("organization_id", companyId)
      .gte("start_datetime", dateRange.from.toISOString())
      .lte("start_datetime", dateRange.to.toISOString());
    if (data) setScheduleItems(data);
  };

  // Filter leads by date range
  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      const createdAt = parseISO(l.created_at);
      return isAfter(createdAt, startOfDay(dateRange.from)) && 
             isBefore(createdAt, endOfDay(dateRange.to));
    });
  }, [leads, dateRange]);

  // Calculate comparison period
  const comparisonPeriod = useMemo(() => {
    const days = differenceInDays(dateRange.to, dateRange.from);
    return {
      from: subDays(dateRange.from, days + 1),
      to: subDays(dateRange.from, 1)
    };
  }, [dateRange]);

  const comparisonLeads = useMemo(() => {
    if (!compareMode) return [];
    return leads.filter(l => {
      const createdAt = parseISO(l.created_at);
      return isAfter(createdAt, startOfDay(comparisonPeriod.from)) && 
             isBefore(createdAt, endOfDay(comparisonPeriod.to));
    });
  }, [leads, comparisonPeriod, compareMode]);

  // Calculate KPIs — use server-side RPC stats when available, fall back to client-side
  const kpis = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    const daysInRange = differenceInDays(dateRange.to, dateRange.from) + 1;
    const stats = dashboardStats;

    // Use RPC data if available
    const totalLeads = stats?.active_pipeline ?? stats?.total_leads ?? leads.length;
    const leadsInPeriod = stats?.leads_in_period ?? filteredLeads.length;
    const comparisonTotal = comparisonLeads.length;
    const totalGrowth = comparisonTotal > 0 
      ? ((leadsInPeriod - comparisonTotal) / comparisonTotal * 100).toFixed(1)
      : leadsInPeriod > 0 ? 100 : 0;

    // Leads today — prioritise RPC (timezone-aware), fall back to local list
    const leadsToday = stats?.leads_today ?? leads.filter(l => isAfter(parseISO(l.created_at), today)).length;

    // Status counts from RPC (already normalized server-side)
    const rpcStatusCounts = stats?.status_counts || {};
    const pendingLeads = rpcStatusCounts['pending'] || rpcStatusCounts['new'] || rpcStatusCounts['novo'] || 0;
    const contactedLeads = rpcStatusCounts['contacted'] || rpcStatusCounts['contactado'] || 0;
    const qualifiedLeads = rpcStatusCounts['qualified'] || rpcStatusCounts['qualificado'] || 0;
    // Conversões no período (eventos de conversão, qualquer data de criação) — KPI próprio
    const convertedLeads = stats?.converted_in_period ?? 0;
    // Coorte: leads criados E convertidos no mesmo período — base da taxa honesta
    const cohortConversions = stats?.cohort_conversions ?? 0;

    // Honest cohort conversion rate: cohort_conversions / leads_in_period
    const conversionRate = leadsInPeriod > 0 ? (cohortConversions / leadsInPeriod * 100).toFixed(1) : 0;
    const comparisonConverted = 0;
    const comparisonConversionRate = 0;

    // Contact attempts from count query
    const totalContactAttempts = contactHistoryCount;

    // Average per day
    const avgLeadsPerDay = (leadsInPeriod / daysInRange).toFixed(1);

    // Leads by assignee from RPC
    const leadsByAssignee: Record<string, number> = stats?.assigned_counts || {};

    // Visits scheduled — prioritise RPC (counts both status and scheduled_visit_id)
    const visitsScheduled = stats?.visits_scheduled ?? rpcStatusCounts['visit_scheduled'] ?? rpcStatusCounts['visita_agendada'] ?? 0;

    return {
      totalLeads,
      leadsInPeriod,
      comparisonTotal,
      totalGrowth: Number(totalGrowth),
      leadsToday,
      pendingLeads,
      contactedLeads,
      qualifiedLeads,
      convertedLeads,
      cohortConversions,
      conversionRate,
      comparisonConversionRate: Number(comparisonConversionRate),
      totalContactAttempts,
      avgLeadsPerDay: Number(avgLeadsPerDay),
      leadsByAssignee,
      visitsScheduled
    };
  }, [leads, filteredLeads, comparisonLeads, compareMode, contactHistoryCount, dashboardStats, dateRange]);

  // Chart: Leads over time — use RPC daily_counts when available
  const leadsOverTime = useMemo(() => {
    const days = differenceInDays(dateRange.to, dateRange.from) + 1;
    const data = Array.from({ length: days }, (_, i) => {
      const date = addDays(dateRange.from, i);
      return {
        date: format(date, "dd/MM", { locale: pt }),
        dateKey: format(date, "yyyy-MM-dd"),
        leads: 0,
        comparison: 0
      };
    });

    // Use RPC daily counts if available
    const dailyCounts = dashboardStats?.daily_counts;
    if (dailyCounts && Array.isArray(dailyCounts)) {
      dailyCounts.forEach((dc: { date: string; count: number }) => {
        const dayData = data.find(d => d.dateKey === dc.date);
        if (dayData) dayData.leads = dc.count;
      });
    } else {
      filteredLeads.forEach(lead => {
        const leadDate = format(startOfDay(parseISO(lead.created_at)), "yyyy-MM-dd");
        const dayData = data.find(d => d.dateKey === leadDate);
        if (dayData) dayData.leads++;
      });
    }

    if (compareMode) {
      comparisonLeads.forEach(lead => {
        const leadDate = startOfDay(parseISO(lead.created_at));
        const dayOffset = differenceInDays(leadDate, comparisonPeriod.from);
        if (dayOffset >= 0 && dayOffset < data.length) {
          data[dayOffset].comparison++;
        }
      });
    }

    return data.map(d => ({ 
      date: d.date, 
      leads: d.leads,
      ...(compareMode ? { comparison: d.comparison } : {})
    }));
  }, [filteredLeads, comparisonLeads, dateRange, compareMode, comparisonPeriod, dashboardStats]);

  // Chart: Status distribution — use RPC status_counts when available
  const statusDistribution = useMemo(() => {
    const effectiveStatusLabels: Record<string, string> = {
      pending: 'Pendente', new: 'Pendente', novo: 'Pendente',
      contacted: 'Contactado', contactado: 'Contactado',
      visit_scheduled: 'Visita Agendada', visita_agendada: 'Visita Agendada',
      qualified: 'Qualificado', qualificado: 'Qualificado',
      converted: 'Convertido', convertido: 'Convertido',
      no_answer: 'Sem Resposta', sem_resposta: 'Sem Resposta',
      callback_scheduled: 'Callback Agendado', callback: 'Callback Agendado',
      lost: 'Perdido', perdido: 'Perdido',
      rejected: 'Rejeitado', rejeitado: 'Rejeitado',
      incomplete: 'Incompleto', incompleto: 'Incompleto',
    };
    const effectiveStatusColors: Record<string, string> = {
      pending: '#eab308', new: '#eab308', novo: '#eab308',
      contacted: '#3b82f6', contactado: '#3b82f6',
      visit_scheduled: '#8b5cf6', visita_agendada: '#8b5cf6',
      qualified: '#22c55e', qualificado: '#22c55e',
      converted: '#10b981', convertido: '#10b981',
      no_answer: '#f97316', sem_resposta: '#f97316',
      callback_scheduled: '#06b6d4', callback: '#06b6d4',
      lost: '#94a3b8', perdido: '#94a3b8',
      rejected: '#ef4444', rejeitado: '#ef4444',
      incomplete: '#a3a3a3', incompleto: '#a3a3a3',
    };

    const rpcCounts = dashboardStats?.status_counts;
    if (rpcCounts && typeof rpcCounts === 'object') {
      return Object.entries(rpcCounts as Record<string, number>)
        .filter(([_, v]) => v > 0)
        .map(([key, value]) => ({
          name: effectiveStatusLabels[key] || key,
          value,
          color: effectiveStatusColors[key] || '#94a3b8'
        }))
        .sort((a, b) => b.value - a.value);
    }

    // Fallback to client-side
    const statusCounts: Record<string, number> = {};
    leads.forEach(lead => {
      const eff = getEffectiveStatus(lead, workflowStages, visitScheduledResultIds);
      statusCounts[eff] = (statusCounts[eff] || 0) + 1;
    });
    return Object.entries(statusCounts)
      .filter(([_, v]) => v > 0)
      .map(([key, value]) => ({
        name: effectiveStatusLabels[key] || key,
        value,
        color: effectiveStatusColors[key] || '#94a3b8'
      }));
  }, [leads, workflowStages, visitScheduledResultIds, dashboardStats]);

  // Chart: Leads by campaign — use RPC campaign_counts when available
  const leadsByCampaign = useMemo(() => {
    const rpcCampaigns = dashboardStats?.campaign_counts;
    if (rpcCampaigns && Array.isArray(rpcCampaigns)) {
      return rpcCampaigns
        .map((c: any) => ({ name: c.campaign_name, leads: c.count }))
        .slice(0, 5);
    }
    // Fallback
    const campaignCounts: Record<string, { name: string; leads: number }> = {};
    leads.forEach(lead => {
      const campaignId = lead.campaign_id || 'unknown';
      const campaignName = lead.campaigns?.name || 'Sem campanha';
      if (!campaignCounts[campaignId]) campaignCounts[campaignId] = { name: campaignName, leads: 0 };
      campaignCounts[campaignId].leads++;
    });
    return Object.values(campaignCounts).sort((a, b) => b.leads - a.leads).slice(0, 5);
  }, [leads, dashboardStats]);

  // Chart: Source distribution — use RPC source_counts when available
  const sourceDistribution = useMemo(() => {
    const sourceLabels: Record<string, string> = {
      public_form: 'Formulário Público', manual: 'Manual', api: 'API', import: 'Importação', unknown: 'Desconhecido'
    };
    const colors = ['#8b5cf6', '#3b82f6', '#22c55e', '#eab308', '#ef4444', '#ec4899'];

    const rpcSources = dashboardStats?.source_counts;
    if (rpcSources && typeof rpcSources === 'object') {
      return Object.entries(rpcSources as Record<string, number>)
        .map(([name, value], index) => ({
          name: sourceLabels[name] || name,
          value,
          color: colors[index % colors.length]
        }))
        .sort((a, b) => b.value - a.value);
    }
    // Fallback
    const sourceCounts: Record<string, number> = {};
    leads.forEach(lead => { sourceCounts[lead.source || 'Desconhecido'] = (sourceCounts[lead.source || 'Desconhecido'] || 0) + 1; });
    return Object.entries(sourceCounts)
      .map(([name, value], index) => ({ name: sourceLabels[name] || name, value, color: colors[index % colors.length] }))
      .sort((a, b) => b.value - a.value);
  }, [leads, dashboardStats]);
  const KPICard = ({ 
    title, 
    value, 
    subtitle, 
    icon: Icon, 
    trend,
    trendValue,
    color = "primary"
  }: { 
    title: string; 
    value: string | number; 
    subtitle?: string;
    icon: any;
    trend?: 'up' | 'down' | 'neutral';
    trendValue?: string | number;
    color?: string;
  }) => (
    <Card className="relative overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
            {trend && trendValue !== undefined && (
              <div className={`flex items-center gap-1 text-sm ${
                trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground'
              }`}>
                {trend === 'up' ? (
                  <ArrowUpRight className="h-4 w-4" />
                ) : trend === 'down' ? (
                  <ArrowDownRight className="h-4 w-4" />
                ) : null}
                <span>{trendValue}%</span>
                <span className="text-muted-foreground">vs semana anterior</span>
              </div>
            )}
          </div>
          <div className={`h-12 w-12 rounded-xl flex items-center justify-center bg-primary/10`}>
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Date Filters */}
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
                    onSelect={(date) => date && setDateRange(prev => ({ ...prev, from: date }))}
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
                    onSelect={(date) => date && setDateRange(prev => ({ ...prev, to: date }))}
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
              <Label htmlFor="compare" className="text-sm text-muted-foreground">Comparar período anterior</Label>
              <input
                type="checkbox"
                id="compare"
                checked={compareMode}
                onChange={(e) => setCompareMode(e.target.checked)}
                className="rounded border-input"
              />
            </div>
          </div>
          {compareMode && (
            <div className="mt-2 text-xs text-muted-foreground">
              <CalendarRange className="inline h-3 w-3 mr-1" />
              Comparando com: {format(comparisonPeriod.from, "dd/MM", { locale: pt })} - {format(comparisonPeriod.to, "dd/MM", { locale: pt })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <KPICard
          title="Total Pipeline Ativo"
          value={kpis.totalLeads}
          subtitle={`leads em pipeline · ${kpis.leadsToday} hoje`}
          icon={Users}
          trend={compareMode && kpis.totalGrowth !== 0 ? (kpis.totalGrowth > 0 ? 'up' : 'down') : undefined}
          trendValue={compareMode ? Math.abs(kpis.totalGrowth) : undefined}
        />
        <KPICard
          title="Novos no Período"
          value={kpis.leadsInPeriod}
          subtitle={`leads criados · média ${kpis.avgLeadsPerDay}/dia`}
          icon={UserPlus}
        />
        <KPICard
          title="Contactos Efectuados"
          value={kpis.totalContactAttempts}
          subtitle="tentativas no período"
          icon={PhoneCall}
        />
        <KPICard
          title="Visitas Agendadas"
          value={kpis.visitsScheduled}
          subtitle="no período"
          icon={CalendarCheck}
        />
        <KPICard
          title="Conversões no Período"
          value={kpis.convertedLeads}
          subtitle="leads convertidos no período"
          icon={UserCheck}
        />
        <KPICard
          title="Taxa Conversão (coorte)"
          value={`${kpis.conversionRate}%`}
          subtitle={`${kpis.cohortConversions} dos ${kpis.leadsInPeriod} novos converteram`}
          icon={Target}
        />
      </div>

      {/* Leads by Assignee */}
      {Object.keys(kpis.leadsByAssignee).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Leads por Colaborador</CardTitle>
            <CardDescription>Distribuição no período selecionado</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {Object.entries(kpis.leadsByAssignee)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 12)
                .map(([userId, count]) => {
                  const user = users.find(u => u.id === userId);
                  return (
                    <div key={userId} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                        {count}
                      </div>
                      <span className="text-sm truncate">{user?.name || user?.email || 'Desconhecido'}</span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Area Chart - Leads Over Time */}
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
                {kpis.leadsInPeriod} no período
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={leadsOverTime} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }} 
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }} 
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
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
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Pie Chart - Status Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Por Estado</CardTitle>
            <CardDescription>Distribuição atual</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
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
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-2 mt-4 justify-center">
              {statusDistribution.slice(0, 4).map((status, index) => (
                <div key={index} className="flex items-center gap-1.5 text-xs">
                  <div 
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: status.color }}
                  />
                  <span className="text-muted-foreground">{status.name}</span>
                  <span className="font-medium">{status.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart - By Campaign */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Por Campanha</CardTitle>
            <CardDescription>Top 5 campanhas com mais leads</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leadsByCampaign} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    tick={{ fontSize: 11 }} 
                    tickLine={false} 
                    axisLine={false}
                    width={120}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar 
                    dataKey="leads" 
                    fill="hsl(var(--primary))" 
                    radius={[0, 4, 4, 0]}
                    name="Leads"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Pie Chart - Source Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Por Origem</CardTitle>
            <CardDescription>De onde vêm os leads</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sourceDistribution}
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {sourceDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {sourceDistribution.map((source, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <div 
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: source.color }}
                  />
                  <span className="text-muted-foreground truncate">{source.name}</span>
                  <span className="font-semibold ml-auto">{source.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-200/50 dark:border-blue-800/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <UserPlus className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{kpis.leadsToday}</p>
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
              <p className="text-2xl font-bold">{kpis.pendingLeads}</p>
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
              <p className="text-2xl font-bold">{kpis.qualifiedLeads}</p>
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
              <p className="text-2xl font-bold">{kpis.convertedLeads}</p>
              <p className="text-xs text-muted-foreground">Convertidos</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
