import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ArrowLeft, Plus, Megaphone, Loader2, Mail, MessageSquare, Facebook, Instagram, 
  Linkedin, Smartphone, Globe, Pencil, Trash2, Radio, Users, Calendar, DollarSign,
  Building2, Briefcase, MapPin, ListPlus, Eye, EyeOff, Monitor, Bell, Video, Twitter, Youtube,
  TrendingUp, TrendingDown, Target, BarChart3, PieChart, Activity, MousePointer, 
  UserPlus, Zap, ArrowUpRight, ArrowDownRight, RefreshCw, Upload, Info
} from "lucide-react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChannelUtmMappings } from "@/components/campaigns/ChannelUtmMappings";
import { Checkbox } from "@/components/ui/checkbox";
import { PermissionGate } from "@/components/PermissionGate";
import { useCompany } from "@/contexts/CompanyContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart as RechartsPieChart, Pie, Cell, Legend, AreaChart, Area } from "recharts";

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  organization_id: string | null;
  organization: { name: string } | null;
  total_leads: number | null;
  total_conversions: number | null;
  total_revenue: number | null;
  total_spend: number | null;
}

interface Channel {
  id: string;
  campaign_id: string;
  name: string;
  type: string;
  description: string | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  target_audience: string | null;
  metrics: any;
  source_id?: string | null;
}

interface ChannelType {
  id: string;
  name: string;
  label: string;
  icon: string | null;
}

interface MarketingList {
  id: string;
  name: string;
  contacts_count?: number;
}

interface ChildOrganization {
  id: string;
  name: string;
  type: string;
}

interface ChannelMetrics {
  channel_id: string;
  channel_name: string;
  channel_type: string;
  impressions: number;
  clicks: number;
  conversions: number;
  leads: number;
  spend: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cpl: number;
  roas: number;
}

interface CampaignGoal {
  id: string;
  goal_type: string;
  target_value: number;
  current_value: number;
  progress: number;
}

interface CampaignLead {
  id: string;
  status: string;
  source: string | null;
  medium: string | null;
  channel_id: string | null;
  channel_name?: string;
  anew_lead_id?: string | null;
  lead_name?: string | null;
  lead_email?: string | null;
  created_at: string;
  conversion_value: number | null;
}

const CHART_COLORS = ["#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#0088fe", "#00C49F", "#FFBB28", "#FF8042"];

const CampaignDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";
  const { toast } = useToast();

  const { activeCompany } = useCompany();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelTypes, setChannelTypes] = useState<ChannelType[]>([]);
  const [marketingLists, setMarketingLists] = useState<MarketingList[]>([]);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const [campaignOrgs, setCampaignOrgs] = useState<ChildOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Metrics
  const [channelMetrics, setChannelMetrics] = useState<ChannelMetrics[]>([]);
  const [goals, setGoals] = useState<CampaignGoal[]>([]);
  const [leads, setLeads] = useState<CampaignLead[]>([]);
  const [dailyMetrics, setDailyMetrics] = useState<any[]>([]);
  const [totalMetrics, setTotalMetrics] = useState({
    impressions: 0,
    clicks: 0,
    conversions: 0,
    leads: 0,
    spend: 0,
    revenue: 0,
  });
  const [realLeadsMeta, setRealLeadsMeta] = useState<{ real: number; imported: number; unattributed: number; duplicates: number }>({ real: 0, imported: 0, unattributed: 0, duplicates: 0 });

  // Overview filters (date range + bucket + channel)
  const defaultRange = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 30);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }, []);
  const [fRange, setFRange] = useState<{ from: string; to: string }>(defaultRange);
  const [fBucket, setFBucket] = useState<"day" | "week" | "month" | "year">("day");
  const [fChannelId, setFChannelId] = useState<string>("__all__");
  const [dashboardLoading, setDashboardLoading] = useState(false);

  // Channel dialog
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [channelToDelete, setChannelToDelete] = useState<Channel | null>(null);

  // Goals dialog
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [goalFormData, setGoalFormData] = useState({
    goal_type: "leads",
    target_value: "",
  });

  // Metrics dialog
  const [metricsDialogOpen, setMetricsDialogOpen] = useState(false);
  const [selectedChannelForMetrics, setSelectedChannelForMetrics] = useState<Channel | null>(null);
  const [metricsFormData, setMetricsFormData] = useState({
    metric_date: new Date().toISOString().split('T')[0],
    impressions: "",
    clicks: "",
    conversions: "",
    leads: "",
    spend: "",
    revenue: "",
    opens: "",
    bounces: "",
  });

  // Lists dialog
  const [listsDialogOpen, setListsDialogOpen] = useState(false);
  const [availableLists, setAvailableLists] = useState<MarketingList[]>([]);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);

  // Lead dialog
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [leadFormData, setLeadFormData] = useState({
    channel_id: "none",
    source: "",
    medium: "",
    status: "new",
    notes: "",
  });

  const [channelFormData, setChannelFormData] = useState({
    name: "",
    type: "email",
    description: "",
    is_active: true,
    start_date: "",
    end_date: "",
    target_audience: "",
    source_id: null as string | null,
  });

  const [leadSources, setLeadSources] = useState<Array<{ id: string; name: string; color: string | null; icon: string | null }>>([]);

  useEffect(() => {
    void loadCampaignData();
  }, [loadCampaignData]);

  // Re-aggregate dashboard metrics from per-channel RPC when filters change.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadDashboardMetrics is intentionally excluded: it is
  // defined below this effect and references channels/fRange/fBucket/fChannelId which are already listed as deps.
  // Including it would require useCallback with those same deps, creating an equivalent but more complex dependency
  // chain. The current pattern is safe because all reactive values the function closes over are explicit deps here.
  useEffect(() => {
    if (!id || channels.length === 0) return;
    loadDashboardMetrics();
  }, [id, channels, fRange.from, fRange.to, fBucket, fChannelId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDashboardMetrics = async () => {
    if (!id) return;
    try {
      setDashboardLoading(true);
      const scope = fChannelId === "__all__"
        ? channels
        : channels.filter((c) => c.id === fChannelId);
      const windowDays = Math.max(
        1,
        Math.ceil((new Date(fRange.to).getTime() - new Date(fRange.from).getTime()) / 86_400_000)
      );

      const results = await Promise.all(
        scope.map(async (ch) => {
          const { data, error } = await (supabase as any).rpc("get_channel_dashboard", {
            p_channel_id: ch.id,
            p_date_from: fRange.from,
            p_date_to: fRange.to,
            p_bucket: fBucket,
            p_window_days: windowDays,
          });
          return { channel: ch, dash: error ? null : (data as any) };
        })
      );

      const cm: ChannelMetrics[] = [];
      const totals = { impressions: 0, clicks: 0, conversions: 0, leads: 0, spend: 0, revenue: 0 };
      const bucketMap: Record<string, any> = {};

      for (const { channel, dash } of results) {
        const s = dash?.summary ?? {};
        const impressions = Number(s.impressions ?? 0);
        const clicks = Number(s.clicks ?? 0);
        const conversions = Number(s.conversions ?? 0);
        const leads = Number(s.leads ?? 0);
        const spend = Number(s.spend ?? 0);
        const revenue = Number(s.revenue ?? 0);

        cm.push({
          channel_id: channel.id,
          channel_name: channel.name,
          channel_type: channel.type,
          impressions, clicks, conversions, leads, spend, revenue,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          cpc: clicks > 0 ? spend / clicks : 0,
          cpl: leads > 0 ? spend / leads : 0,
          roas: spend > 0 ? revenue / spend : 0,
        });
        totals.impressions += impressions;
        totals.clicks += clicks;
        totals.conversions += conversions;
        totals.leads += leads;
        totals.spend += spend;
        totals.revenue += revenue;

        for (const row of (dash?.series ?? []) as any[]) {
          const k = String(row.bucket ?? "");
          if (!bucketMap[k]) {
            bucketMap[k] = { date: k, impressions: 0, clicks: 0, conversions: 0, leads: 0, spend: 0, revenue: 0 };
          }
          bucketMap[k].leads += Number(row.leads ?? 0);
          bucketMap[k].conversions += Number(row.conversions ?? 0);
          bucketMap[k].spend += Number(row.spend ?? 0);
          bucketMap[k].revenue += Number(row.revenue ?? 0);
        }
      }

      // Unattributed leads (only when no channel filter is applied)
      if (fChannelId === "__all__") {
        const { data: unattribRows } = await (supabase as any)
          .from("campaign_leads")
          .select("anew_lead_id, id")
          .eq("campaign_id", id)
          .is("channel_id", null)
          .gte("created_at", `${fRange.from}T00:00:00`)
          .lte("created_at", `${fRange.to}T23:59:59`);
        const unattribCount = new Set(
          (unattribRows ?? []).map((r: any) => r.anew_lead_id ?? r.id)
        ).size;
        if (unattribCount > 0) {
          cm.push({
            channel_id: "__unattributed__",
            channel_name: "Sem canal / Não atribuído",
            channel_type: "",
            impressions: 0, clicks: 0, conversions: 0,
            leads: unattribCount,
            spend: 0, revenue: 0, ctr: 0, cpc: 0, cpl: 0, roas: 0,
          });
          totals.leads += unattribCount;
        }
        setRealLeadsMeta((prev) => ({ ...prev, real: totals.leads, unattributed: unattribCount }));
      } else {
        setRealLeadsMeta((prev) => ({ ...prev, real: totals.leads, unattributed: 0 }));
      }

      setChannelMetrics(cm);
      setTotalMetrics(totals);
      setDailyMetrics(Object.values(bucketMap).sort((a: any, b: any) => a.date.localeCompare(b.date)));
    } catch (err: any) {
      toast({
        title: "Erro ao carregar métricas do dashboard",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setDashboardLoading(false);
    }
  };


  const loadCampaignData = useCallback(async () => {
    if (!id) return;

    try {
      const [
        campaignRes, 
        channelsRes, 
        channelTypesRes, 
        campaignListsRes,
        campaignOrgsRes,
        goalsRes,
        leadsRes,
        leadSourcesRes,
      ] = await Promise.all([
        supabase.from("campaigns").select("*, organization:anew_organizations!campaigns_organization_id_anew_fkey(name)").eq("id", id).single(),
        supabase.from("channels").select("*").eq("campaign_id", id).order("created_at", { ascending: false }),
        supabase.from("channel_types").select("*").eq("is_active", true).order("label"),
        supabase.from("campaign_marketing_lists").select("marketing_list_id, marketing_lists(id, name)").eq("campaign_id", id),
        supabase.from("campaign_organizations").select("organization_id, anew_organizations(id, name, type)").eq("campaign_id", id),
        supabase.from("campaign_goals").select("id, campaign_id, goal_type, target_value, current_value").eq("campaign_id", id),
        supabase.from("campaign_leads").select("id, campaign_id, channel_id, anew_lead_id, status, source, medium, conversion_value, created_at, notes, channels(name)").eq("campaign_id", id).order("created_at", { ascending: false }).limit(50),
        (() => {
          let q = supabase.from("lead_sources").select("id, name, color, icon").eq("is_active", true);
          if (activeCompany?.id) {
            q = q.or(`organization_id.eq.${activeCompany.id},organization_id.is.null`);
          }
          return q.order("name");
        })(),
      ]);

      if (campaignRes.error) throw campaignRes.error;

      setCampaign(campaignRes.data);
      const channelsData = channelsRes.data || [];
      setChannels(channelsData as any);

      if (leadSourcesRes.error) {
        toast({
          title: "Erro ao carregar origens de lead",
          description: leadSourcesRes.error.message,
          variant: "destructive",
        });
      }
      setLeadSources((leadSourcesRes.data || []) as any);
      setChannelTypes(channelTypesRes.data || []);
      // Lists are filtered by organization_id so only the active org's lists are available.
      // Guard against undefined activeCompany: without an active org there are no lists to show.
      if (!activeCompany?.id) {
        setAvailableLists([]);
      } else {
        const listsRes = await supabase
          .from("marketing_lists")
          .select("id, name")
          .eq("organization_id", activeCompany.id)
          .order("name");
        if (listsRes.error) throw listsRes.error;
        setAvailableLists(listsRes.data || []);
      }
      
      const linkedLists = (campaignListsRes.data || []).map((l: any) => l.marketing_lists).filter(Boolean);
      setMarketingLists(linkedLists);
      setSelectedLists(linkedLists.map((l: MarketingList) => l.id));

      const linkedOrgs = (campaignOrgsRes.data || []).map((o: any) => o.anew_organizations).filter(Boolean) as ChildOrganization[];
      setCampaignOrgs(linkedOrgs);

      // Process goals
      const goalsData = (goalsRes.data || []).map((g: any) => ({
        ...g,
        progress: g.target_value > 0 ? Math.min((g.current_value / g.target_value) * 100, 100) : 0,
      }));
      setGoals(goalsData);

      // Process leads
      const leadsRaw = (leadsRes.data || []) as any[];
      // Enrich with lead identity (name + email)
      const anewIds = Array.from(new Set(leadsRaw.map((l) => l.anew_lead_id).filter(Boolean)));
      const identityMap = new Map<string, { name: string | null; email: string | null }>();
      if (anewIds.length > 0) {
        for (let i = 0; i < anewIds.length; i += 200) {
          const batch = anewIds.slice(i, i + 200);
          const { data: anew } = await (supabase as any)
            .from("anew_leads")
            .select("id, field_values, entity:anew_entities!anew_leads_entity_id_fkey(display_name)")
            .in("id", batch);
          for (const a of anew ?? []) {
            const fv = (a.field_values ?? {}) as Record<string, any>;
            identityMap.set(a.id, {
              name: a.entity?.display_name ?? null,
              email: fv.email ?? fv.Email ?? null,
            });
          }
        }
      }
      const leadsData = leadsRaw.map((l: any) => ({
        ...l,
        channel_name: l.channels?.name,
        lead_name: l.anew_lead_id ? identityMap.get(l.anew_lead_id)?.name ?? null : null,
        lead_email: l.anew_lead_id ? identityMap.get(l.anew_lead_id)?.email ?? null : null,
      }));
      setLeads(leadsData);

      // Fetch channel metrics with server-side filter
      const channelIds = channelsData.map(c => c.id);
      const metricsRes = channelIds.length > 0
        ? await supabase.from("channel_metrics")
            .select("id, channel_id, metric_date, impressions, clicks, conversions, leads, spend, revenue, channels(name, type)")
            .in("channel_id", channelIds)
            .order("metric_date", { ascending: true })
        : { data: [] as any[], error: null };

      const metricsData = metricsRes.data || [];
      
      // Aggregate metrics by channel
      const channelMetricsMap: Record<string, ChannelMetrics> = {};
      const totals = { impressions: 0, clicks: 0, conversions: 0, leads: 0, spend: 0, revenue: 0 };
      
      metricsData.forEach((m: any) => {
        if (!channelMetricsMap[m.channel_id]) {
          channelMetricsMap[m.channel_id] = {
            channel_id: m.channel_id,
            channel_name: m.channels?.name || "",
            channel_type: m.channels?.type || "",
            impressions: 0,
            clicks: 0,
            conversions: 0,
            leads: 0,
            spend: 0,
            revenue: 0,
            ctr: 0,
            cpc: 0,
            cpl: 0,
            roas: 0,
          };
        }
        channelMetricsMap[m.channel_id].impressions += m.impressions || 0;
        channelMetricsMap[m.channel_id].clicks += m.clicks || 0;
        channelMetricsMap[m.channel_id].conversions += m.conversions || 0;
        channelMetricsMap[m.channel_id].leads += m.leads || 0;
        channelMetricsMap[m.channel_id].spend += parseFloat(m.spend) || 0;
        channelMetricsMap[m.channel_id].revenue += parseFloat(m.revenue) || 0;

        totals.impressions += m.impressions || 0;
        totals.clicks += m.clicks || 0;
        totals.conversions += m.conversions || 0;
        totals.leads += m.leads || 0;
        totals.spend += parseFloat(m.spend) || 0;
        totals.revenue += parseFloat(m.revenue) || 0;
      });

      // Calculate derived metrics (will be overridden below for leads/cpl by real counts)
      Object.values(channelMetricsMap).forEach((cm) => {
        cm.ctr = cm.impressions > 0 ? (cm.clicks / cm.impressions) * 100 : 0;
        cm.cpc = cm.clicks > 0 ? cm.spend / cm.clicks : 0;
        cm.cpl = cm.leads > 0 ? cm.spend / cm.leads : 0;
        cm.roas = cm.spend > 0 ? cm.revenue / cm.spend : 0;
      });

      // --- Real lead counts via campaign_leads ---
      // AUDIT 03 #6: 1 lead = 1 canal. leadKey = anew_lead_id ?? id (preserves legacy rows).
      // Canonical row per leadKey = newest by created_at (tie-break id). Σ(per-canal) + unattributed === total.
      const { data: clRows } = await supabase
        .from("campaign_leads")
        .select("id, anew_lead_id, channel_id, created_at")
        .eq("campaign_id", id);
      const allRows = (clRows || []) as Array<{ id: string; anew_lead_id: string | null; channel_id: string | null; created_at: string | null }>;

      const byLead = new Map<string, typeof allRows>();
      for (const r of allRows) {
        const key = r.anew_lead_id ?? r.id;
        const arr = byLead.get(key) ?? [];
        arr.push(r);
        byLead.set(key, arr);
      }

      const totalSet = new Set<string>();
      const perChannelSets: Record<string, Set<string>> = {};
      const unattributedSet = new Set<string>();
      let duplicates = 0;
      for (const [key, rows] of byLead) {
        totalSet.add(key);
        // Canonical: newest by created_at, then id desc as tie-break.
        const canonical = [...rows].sort((a, b) => {
          const ca = a.created_at ?? "";
          const cb = b.created_at ?? "";
          if (ca !== cb) return ca < cb ? 1 : -1;
          return a.id < b.id ? 1 : -1;
        })[0];
        if (canonical.channel_id) {
          (perChannelSets[canonical.channel_id] ||= new Set()).add(key);
        } else {
          unattributedSet.add(key);
        }
        // Duplicate attribution: another row with a different non-null channel.
        if (rows.some((r) => r.channel_id && r.channel_id !== canonical.channel_id)) {
          duplicates++;
        }
      }

      const importedLeadsTotal = totals.leads;
      const realLeadsTotal = totalSet.size;

      // Override totals.leads with real count.
      totals.leads = realLeadsTotal;

      // Ensure channels with real leads but without channel_metrics rows still appear.
      Object.keys(perChannelSets).forEach((chId) => {
        if (!channelMetricsMap[chId]) {
          const ch = channelsData.find((c: any) => c.id === chId);
          channelMetricsMap[chId] = {
            channel_id: chId,
            channel_name: ch?.name || "",
            channel_type: ch?.type || "",
            impressions: 0,
            clicks: 0,
            conversions: 0,
            leads: 0,
            spend: 0,
            revenue: 0,
            ctr: 0,
            cpc: 0,
            cpl: 0,
            roas: 0,
          };
        }
      });

      // Override per-channel leads + recalc CPL with real counts.
      Object.values(channelMetricsMap).forEach((cm) => {
        const real = perChannelSets[cm.channel_id]?.size ?? 0;
        cm.leads = real;
        cm.cpl = real > 0 ? cm.spend / real : 0;
      });

      // Add synthetic "Sem canal / Não atribuído" row if there are unattributed leads.
      if (unattributedSet.size > 0) {
        channelMetricsMap["__unattributed__"] = {
          channel_id: "__unattributed__",
          channel_name: "Sem canal / Não atribuído",
          channel_type: "",
          impressions: 0,
          clicks: 0,
          conversions: 0,
          leads: unattributedSet.size,
          spend: 0,
          revenue: 0,
          ctr: 0,
          cpc: 0,
          cpl: 0,
          roas: 0,
        };
      }

      setChannelMetrics(Object.values(channelMetricsMap));
      setTotalMetrics(totals);
      setRealLeadsMeta({
        real: realLeadsTotal,
        imported: importedLeadsTotal,
        unattributed: unattributedSet.size,
        duplicates,
      });

      // Daily metrics for chart
      const dailyMap: Record<string, any> = {};
      metricsData.forEach((m: any) => {
        if (!dailyMap[m.metric_date]) {
          dailyMap[m.metric_date] = {
            date: m.metric_date,
            impressions: 0,
            clicks: 0,
            conversions: 0,
            leads: 0,
            spend: 0,
            revenue: 0,
          };
        }
        dailyMap[m.metric_date].impressions += m.impressions || 0;
        dailyMap[m.metric_date].clicks += m.clicks || 0;
        dailyMap[m.metric_date].conversions += m.conversions || 0;
        dailyMap[m.metric_date].leads += m.leads || 0;
        dailyMap[m.metric_date].spend += parseFloat(m.spend) || 0;
        dailyMap[m.metric_date].revenue += parseFloat(m.revenue) || 0;
      });
      setDailyMetrics(Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)));

    } catch (error: any) {
      toast({
        title: "Error loading campaign",
        description: error.message,
        variant: "destructive",
      });
      navigate("/campaigns");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, activeCompany, toast, navigate]);

  const handleRefresh = () => {
    setRefreshing(true);
    void loadCampaignData();
  };

  const getChannelIcon = (type: string) => {
    const icons: Record<string, any> = {
      email: Mail,
      sms: MessageSquare,
      whatsapp: Smartphone,
      facebook: Facebook,
      instagram: Instagram,
      linkedin: Linkedin,
      google_ads: Globe,
      meta: Globe,
      tiktok: Video,
      youtube: Youtube,
      twitter: Twitter,
      display: Monitor,
      push: Bell,
    };
    return icons[type] || Radio;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-muted text-muted-foreground",
      active: "bg-success/10 text-success",
      paused: "bg-warning/10 text-warning",
      completed: "bg-info/10 text-info",
    };
    return colors[status] || colors.draft;
  };

  const getLeadStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      new: "bg-info/10 text-info",
      contacted: "bg-warning/10 text-warning",
      qualified: "bg-primary/10 text-primary",
      converted: "bg-success/10 text-success",
      lost: "bg-destructive/10 text-destructive",
    };
    return colors[status] || colors.new;
  };

  const resetChannelForm = () => {
    setChannelFormData({
      name: "",
      type: "email",
      description: "",
      is_active: true,
      start_date: "",
      end_date: "",
      target_audience: "",
      source_id: null,
    });
    setEditingChannel(null);
  };

  const openEditChannel = (channel: Channel) => {
    setEditingChannel(channel);
    setChannelFormData({
      name: channel.name,
      type: channel.type,
      description: channel.description || "",
      is_active: channel.is_active,
      start_date: channel.start_date || "",
      end_date: channel.end_date || "",
      target_audience: channel.target_audience || "",
      source_id: (channel as any).source_id ?? null,
    });
    setChannelDialogOpen(true);
  };

  const handleChannelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    if (!channelFormData.name) {
      toast({ title: "Validation Error", description: "Channel name is required", variant: "destructive" });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const channelData = {
        campaign_id: id,
        name: channelFormData.name,
        type: channelFormData.type,
        description: channelFormData.description || null,
        is_active: channelFormData.is_active,
        start_date: channelFormData.start_date || null,
        end_date: channelFormData.end_date || null,
        target_audience: channelFormData.target_audience || null,
        source_id: channelFormData.source_id ?? null,
      } as any;

      if (editingChannel) {
        const { error } = await (supabase.from("channels") as any).update(channelData).eq("id", editingChannel.id);
        if (error) throw error;
        toast({ title: "Channel updated successfully!" });
      } else {
        const businessUserId = await resolveCurrentBusinessUserId();
        if (!businessUserId) throw new Error("Business user not found for current auth user");
        const { error } = await (supabase.from("channels") as any).insert({ ...channelData, created_by: businessUserId });
        if (error) throw error;
        toast({ title: "Channel created successfully!" });
      }

      setChannelDialogOpen(false);
      resetChannelForm();
      void loadCampaignData();
    } catch (error: any) {
      toast({ title: "Error saving channel", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteChannel = async () => {
    if (!channelToDelete) return;
    try {
      const { error } = await supabase.from("channels").delete().eq("id", channelToDelete.id);
      if (error) throw error;
      toast({ title: "Channel deleted successfully!" });
      void loadCampaignData();
    } catch (error: any) {
      toast({ title: "Error deleting channel", description: error.message, variant: "destructive" });
    } finally {
      setDeleteDialogOpen(false);
      setChannelToDelete(null);
    }
  };

  const openListsDialog = () => {
    setSelectedListIds(selectedLists);
    setListsDialogOpen(true);
  };

  const handleSaveLists = async () => {
    if (!id) return;
    try {
      await supabase.from("campaign_marketing_lists").delete().eq("campaign_id", id);
      if (selectedListIds.length > 0) {
        const { error } = await supabase.from("campaign_marketing_lists").insert(
          selectedListIds.map((listId) => ({ campaign_id: id, marketing_list_id: listId }))
        );
        if (error) throw error;
      }
      toast({ title: "Marketing lists updated successfully!" });
      setListsDialogOpen(false);
      void loadCampaignData();
    } catch (error: any) {
      toast({ title: "Error updating lists", description: error.message, variant: "destructive" });
    }
  };

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    try {
      const { error } = await supabase.from("campaign_goals").insert({
        campaign_id: id,
        goal_type: goalFormData.goal_type,
        target_value: parseFloat(goalFormData.target_value),
      });
      if (error) throw error;
      toast({ title: "Goal added successfully!" });
      setGoalDialogOpen(false);
      setGoalFormData({ goal_type: "leads", target_value: "" });
      void loadCampaignData();
    } catch (error: any) {
      toast({ title: "Error adding goal", description: error.message, variant: "destructive" });
    }
  };

  const handleAddMetrics = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChannelForMetrics) return;

    try {
      // Preserve historical leads/conversions/revenue on existing rows.
      // For new rows, omit these fields entirely so they keep their column defaults
      // (these metrics are now derived; manually setting them would create misleading history).
      const { data: existing } = await supabase
        .from("channel_metrics")
        .select("id, leads, conversions, revenue")
        .eq("channel_id", selectedChannelForMetrics.id)
        .eq("metric_date", metricsFormData.metric_date)
        .maybeSingle();

      const payload: any = {
        channel_id: selectedChannelForMetrics.id,
        metric_date: metricsFormData.metric_date,
        impressions: parseInt(metricsFormData.impressions) || 0,
        clicks: parseInt(metricsFormData.clicks) || 0,
        spend: parseFloat(metricsFormData.spend) || 0,
        opens: parseInt(metricsFormData.opens) || 0,
        bounces: parseInt(metricsFormData.bounces) || 0,
      };
      if (existing) {
        // Keep historical values untouched
        payload.leads = existing.leads;
        payload.conversions = existing.conversions;
        payload.revenue = existing.revenue;
      }

      const { error } = await supabase
        .from("channel_metrics")
        .upsert(payload, { onConflict: 'channel_id,metric_date' });

      if (error) throw error;
      toast({ title: "Metrics saved successfully!" });
      setMetricsDialogOpen(false);
      setSelectedChannelForMetrics(null);
      setMetricsFormData({
        metric_date: new Date().toISOString().split('T')[0],
        impressions: "", clicks: "", conversions: "", leads: "", spend: "", revenue: "", opens: "", bounces: "",
      });
      void loadCampaignData();
    } catch (error: any) {
      toast({ title: "Error saving metrics", description: error.message, variant: "destructive" });
    }
  };

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    try {
      const { error } = await supabase.from("campaign_leads").insert({
        campaign_id: id,
        channel_id: leadFormData.channel_id === "none" ? null : leadFormData.channel_id,
        source: leadFormData.source || null,
        medium: leadFormData.medium || null,
        status: leadFormData.status,
        notes: leadFormData.notes || null,
      });
      if (error) throw error;
      toast({ title: "Lead added successfully!" });
      setLeadDialogOpen(false);
      setLeadFormData({ channel_id: "none", source: "", medium: "", status: "new", notes: "" });
      void loadCampaignData();
    } catch (error: any) {
      toast({ title: "Error adding lead", description: error.message, variant: "destructive" });
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toLocaleString();
  };

  const formatCurrency = (num: number) => {
    const fixed = Math.abs(num).toFixed(2);
    const [int, dec] = fixed.split('.');
    return '€' + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
  };

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <OlyviaLoader size={40} />
        </div>
      </>
    );
  }

  if (!campaign) {
    return (
      <>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Campaign not found</p>
          <Button variant="outline" onClick={() => navigate("/campaigns")} className="mt-4">Back to Campaigns</Button>
        </div>
      </>
    );
  }

  
  const activeChannels = channels.filter(ch => ch.is_active).length;
  const overallCTR = totalMetrics.impressions > 0 ? (totalMetrics.clicks / totalMetrics.impressions) * 100 : 0;
  const overallROAS = totalMetrics.spend > 0 ? totalMetrics.revenue / totalMetrics.spend : 0;
  const budgetUsed = campaign.budget ? (totalMetrics.spend / campaign.budget) * 100 : 0;

  // Pie chart data for channel distribution
  const channelDistribution = channelMetrics.map((cm, i) => ({
    name: cm.channel_name,
    value: cm.spend,
    color: CHART_COLORS[i % CHART_COLORS.length],
  })).filter(c => c.value > 0);

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/campaigns")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <Megaphone className="w-6 h-6 text-primary" />
              <h1 className="text-3xl font-bold">{campaign.name}</h1>
              <Badge className={getStatusColor(campaign.status)}>{campaign.status}</Badge>
            </div>
            {campaign.description && <p className="text-muted-foreground mt-1">{campaign.description}</p>}
          </div>
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <PermissionGate permission="campaigns.edit">
            <Button variant="outline" onClick={() => navigate(`/campaigns`)}>
              <Pencil className="w-4 h-4 mr-2" />
              Edit
            </Button>
          </PermissionGate>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Impressions</span>
              </div>
              <p className="text-2xl font-bold mt-1">{formatNumber(totalMetrics.impressions)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <MousePointer className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Clicks</span>
              </div>
              <p className="text-2xl font-bold mt-1">{formatNumber(totalMetrics.clicks)}</p>
              <p className="text-xs text-muted-foreground">CTR: {overallCTR.toFixed(2)}%</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <UserPlus className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Leads (real)</span>
              </div>
              <p className="text-2xl font-bold mt-1">{formatNumber(realLeadsMeta.real)}</p>
              <p className="text-xs text-muted-foreground">
                CPL: {realLeadsMeta.real > 0 ? formatCurrency(totalMetrics.spend / realLeadsMeta.real) : (totalMetrics.spend > 0 ? `Sem conversões · gasto: ${formatCurrency(totalMetrics.spend)}` : "Sem custo registado")}
              </p>
              {realLeadsMeta.imported !== realLeadsMeta.real && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Importado: {formatNumber(realLeadsMeta.imported)}
                </p>
              )}
              {realLeadsMeta.duplicates > 0 && (
                <p className="text-[10px] text-yellow-700 mt-0.5">
                  Atribuição duplicada — {formatNumber(realLeadsMeta.duplicates)} lead(s)
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <Zap className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Conversions</span>
              </div>
              <p className="text-2xl font-bold mt-1">{formatNumber(totalMetrics.conversions)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Spend</span>
              </div>
              <p className="text-2xl font-bold mt-1">{formatCurrency(totalMetrics.spend)}</p>
              {campaign.budget && (
                <Progress value={budgetUsed} className="h-1 mt-2" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Receita atribuída</span>
              </div>
              <p className="text-2xl font-bold mt-1">
                {totalMetrics.revenue > 0 ? formatCurrency(totalMetrics.revenue) : <span className="text-base font-normal text-muted-foreground">Sem receita atribuída</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                ROAS: {totalMetrics.spend > 0 && totalMetrics.revenue > 0 ? `${overallROAS.toFixed(2)}x` : "—"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Goals Progress */}
        {goals.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Campaign Goals
                </CardTitle>
                <Button size="sm" variant="outline" onClick={() => setGoalDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Goal
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {goals.map((goal) => (
                  <div key={goal.id} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium capitalize">{goal.goal_type}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatNumber(goal.current_value)} / {formatNumber(goal.target_value)}
                      </span>
                    </div>
                    <Progress value={goal.progress} className="h-2" />
                    <p className="text-xs text-muted-foreground text-right">{goal.progress.toFixed(1)}%</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setSearchParams((prev) => { const p = new URLSearchParams(prev); p.set("tab", v); return p; }, { replace: true })} className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="channels">Channels ({channels.length})</TabsTrigger>
            <TabsTrigger value="leads">Leads ({leads.length})</TabsTrigger>
            <TabsTrigger value="lists">Lists ({marketingLists.length})</TabsTrigger>
            <TabsTrigger value="utm">UTM Mappings</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="py-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">De</Label>
                    <Input
                      type="date"
                      value={fRange.from}
                      onChange={(e) => setFRange({ ...fRange, from: e.target.value })}
                      className="h-9 w-[160px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Até</Label>
                    <Input
                      type="date"
                      value={fRange.to}
                      onChange={(e) => setFRange({ ...fRange, to: e.target.value })}
                      className="h-9 w-[160px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Bucket</Label>
                    <Select value={fBucket} onValueChange={(v: any) => setFBucket(v)}>
                      <SelectTrigger className="h-9 w-[120px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="day">Dia</SelectItem>
                        <SelectItem value="week">Semana</SelectItem>
                        <SelectItem value="month">Mês</SelectItem>
                        <SelectItem value="year">Ano</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Canal</Label>
                    <Select value={fChannelId} onValueChange={setFChannelId}>
                      <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todos os canais</SelectItem>
                        {channels.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {dashboardLoading && (
                    <span className="text-xs text-muted-foreground self-center">A atualizar…</span>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Performance Over Time */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    Performance Over Time
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dailyMetrics.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart data={dailyMetrics}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Area type="monotone" dataKey="clicks" stackId="1" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
                        <Area type="monotone" dataKey="conversions" stackId="2" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.6} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                      No data available
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Spend by Channel */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <PieChart className="w-5 h-5" />
                    Spend by Channel
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {channelDistribution.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <RechartsPieChart>
                        <Pie
                          data={channelDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {channelDistribution.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                      No spend data
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Channel Performance Table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Channel Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                {channelMetrics.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Channel</TableHead>
                        <TableHead className="text-right">Impressions</TableHead>
                        <TableHead className="text-right">Clicks</TableHead>
                        <TableHead className="text-right">CTR</TableHead>
                        <TableHead className="text-right">Leads</TableHead>
                        <TableHead className="text-right">Conversions</TableHead>
                        <TableHead className="text-right">Spend</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">ROAS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {channelMetrics.map((cm) => {
                        const Icon = getChannelIcon(cm.channel_type);
                        return (
                          <TableRow key={cm.channel_id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Icon className="w-4 h-4 text-muted-foreground" />
                                {cm.channel_name}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{formatNumber(cm.impressions)}</TableCell>
                            <TableCell className="text-right">{formatNumber(cm.clicks)}</TableCell>
                            <TableCell className="text-right">{cm.ctr.toFixed(2)}%</TableCell>
                            <TableCell className="text-right">{formatNumber(cm.leads)}</TableCell>
                            <TableCell className="text-right">{formatNumber(cm.conversions)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(cm.spend)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(cm.revenue)}</TableCell>
                            <TableCell className="text-right">
                              <span className={cm.spend > 0 && cm.revenue > 0 ? (cm.roas >= 1 ? "text-success" : "text-destructive") : "text-muted-foreground"}>
                                {cm.spend > 0 && cm.revenue > 0 ? `${cm.roas.toFixed(2)}x` : "—"}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No metrics recorded yet. Add metrics to your channels to see performance data.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Channels Tab */}
          <TabsContent value="channels" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-muted-foreground">Manage channels and record metrics</p>
              <PermissionGate permission="channels.create">
                <Button onClick={() => { resetChannelForm(); setChannelDialogOpen(true); }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Channel
                </Button>
              </PermissionGate>
            </div>

            {channels.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Radio className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">No channels created yet</p>
                  <Button onClick={() => { resetChannelForm(); setChannelDialogOpen(true); }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Channel
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {channels.map((channel) => {
                  const Icon = getChannelIcon(channel.type);
                  const channelType = channelTypes.find(t => t.name === channel.type);
                  const metrics = channelMetrics.find(cm => cm.channel_id === channel.id);

                  return (
                    <Card
                      key={channel.id}
                      className="hover:shadow-lg transition-shadow cursor-pointer"
                      onClick={() => navigate(`/channels/${channel.id}`)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="flex items-center gap-2 text-lg">
                              <Icon className="w-5 h-5 text-primary" />
                              {channel.name}
                            </CardTitle>
                            <div className="flex gap-2 mt-2">
                              <Badge variant="outline">{channelType?.label || channel.type}</Badge>
                              {channel.is_active ? (
                                <Badge className="bg-success/10 text-success"><Eye className="w-3 h-3 mr-1" />Active</Badge>
                              ) : (
                                <Badge className="bg-muted text-muted-foreground"><EyeOff className="w-3 h-3 mr-1" />Inactive</Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Abrir dashboard do canal"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/channels/${channel.id}?tab=overview`);
                              }}
                            >
                              <BarChart3 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Registar métricas externas"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedChannelForMetrics(channel);
                                setMetricsDialogOpen(true);
                              }}
                            >
                              <Upload className="w-4 h-4" />
                            </Button>
                            <PermissionGate permission="channels.edit">
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEditChannel(channel); }}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                            </PermissionGate>
                            <PermissionGate permission="channels.delete">
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setChannelToDelete(channel); setDeleteDialogOpen(true); }}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </PermissionGate>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {metrics ? (
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div><span className="text-muted-foreground">Impressions:</span> {formatNumber(metrics.impressions)}</div>
                            <div><span className="text-muted-foreground">Clicks:</span> {formatNumber(metrics.clicks)}</div>
                            <div><span className="text-muted-foreground">Leads:</span> {formatNumber(metrics.leads)}</div>
                            <div><span className="text-muted-foreground">Spend:</span> {formatCurrency(metrics.spend)}</div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No metrics recorded</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Leads Tab */}
          <TabsContent value="leads" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-muted-foreground">Track leads generated by this campaign</p>
              <Button onClick={() => setLeadDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Lead
              </Button>
            </div>

            {leads.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <UserPlus className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">No leads recorded yet</p>
                  <Button onClick={() => setLeadDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add First Lead
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Medium</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell>{new Date(lead.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{lead.lead_name || "—"}</span>
                            {lead.lead_email && (
                              <span className="text-xs text-muted-foreground">{lead.lead_email}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{lead.channel_name || "-"}</TableCell>
                        <TableCell>{lead.source || "-"}</TableCell>
                        <TableCell>{lead.medium || "-"}</TableCell>
                        <TableCell>
                          <Badge className={getLeadStatusColor(lead.status)}>{lead.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {lead.conversion_value ? formatCurrency(lead.conversion_value) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* Lists Tab */}
          <TabsContent value="lists" className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-muted-foreground">Audiência (Listas) — público-alvo da campanha</p>
                <p className="text-xs text-muted-foreground">Listas indicam o público-alvo, não o canal de origem.</p>
              </div>
              <Button onClick={openListsDialog}>
                <ListPlus className="w-4 h-4 mr-2" />
                Manage Lists
              </Button>
            </div>

            {marketingLists.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Users className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">No marketing lists linked</p>
                  <Button onClick={openListsDialog}>
                    <ListPlus className="w-4 h-4 mr-2" />
                    Link Marketing Lists
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>List Name</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {marketingLists.map((list) => (
                      <TableRow key={list.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-muted-foreground" />
                            {list.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => navigate("/lists")}>View</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="utm" className="space-y-4">
            <ChannelUtmMappings campaignId={id!} channels={channels} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Channel Dialog */}
      <Dialog open={channelDialogOpen} onOpenChange={(open) => { setChannelDialogOpen(open); if (!open) resetChannelForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingChannel ? "Edit Channel" : "New Channel"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleChannelSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Channel Name *</Label>
                <Input value={channelFormData.name} onChange={(e) => setChannelFormData({ ...channelFormData, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Channel Type</Label>
                <Select value={channelFormData.type} onValueChange={(value) => setChannelFormData({ ...channelFormData, type: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {channelTypes.map((type) => (
                      <SelectItem key={type.id} value={type.name}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Origem (Source)</Label>
                <Select
                  value={channelFormData.source_id ?? "none"}
                  onValueChange={(v) =>
                    setChannelFormData({ ...channelFormData, source_id: v === "none" ? null : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar origem..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem origem definida</SelectItem>
                    {leadSources.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target Audience</Label>
                <Input value={channelFormData.target_audience} onChange={(e) => setChannelFormData({ ...channelFormData, target_audience: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={channelFormData.start_date} onChange={(e) => setChannelFormData({ ...channelFormData, start_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={channelFormData.end_date} onChange={(e) => setChannelFormData({ ...channelFormData, end_date: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Description</Label>
                <Textarea value={channelFormData.description} onChange={(e) => setChannelFormData({ ...channelFormData, description: e.target.value })} rows={3} />
              </div>
              <div className="col-span-2 flex items-center space-x-2">
                <Switch checked={channelFormData.is_active} onCheckedChange={(checked) => setChannelFormData({ ...channelFormData, is_active: checked })} />
                <Label>Active channel</Label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setChannelDialogOpen(false)}>Cancel</Button>
              <Button type="submit">{editingChannel ? "Update" : "Create"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Metrics Dialog */}
      <Dialog open={metricsDialogOpen} onOpenChange={setMetricsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Log External Metrics - {selectedChannelForMetrics?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            Leads, conversões e receita são derivados automaticamente — não são editáveis aqui. Use Spend Schedule no detalhe do canal para spend canónico.
          </p>
          <form onSubmit={handleAddMetrics} className="space-y-4">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={metricsFormData.metric_date} onChange={(e) => setMetricsFormData({ ...metricsFormData, metric_date: e.target.value })} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Impressions</Label>
                <Input type="number" value={metricsFormData.impressions} onChange={(e) => setMetricsFormData({ ...metricsFormData, impressions: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Clicks</Label>
                <Input type="number" value={metricsFormData.clicks} onChange={(e) => setMetricsFormData({ ...metricsFormData, clicks: e.target.value })} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Spend importado (€)</Label>
                <Input type="number" step="0.01" value={metricsFormData.spend} onChange={(e) => setMetricsFormData({ ...metricsFormData, spend: e.target.value })} />
                <p className="text-xs text-muted-foreground">Histórico — não substitui Spend Schedule.</p>
              </div>
              {selectedChannelForMetrics?.type === 'email' && (
                <>
                  <div className="space-y-2">
                    <Label>Opens</Label>
                    <Input type="number" value={metricsFormData.opens} onChange={(e) => setMetricsFormData({ ...metricsFormData, opens: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Bounces</Label>
                    <Input type="number" value={metricsFormData.bounces} onChange={(e) => setMetricsFormData({ ...metricsFormData, bounces: e.target.value })} />
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setMetricsDialogOpen(false)}>Cancel</Button>
              <Button type="submit">Save Metrics</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Goal Dialog */}
      <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Campaign Goal</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddGoal} className="space-y-4">
            <div className="space-y-2">
              <Label>Goal Type</Label>
              <Select value={goalFormData.goal_type} onValueChange={(value) => setGoalFormData({ ...goalFormData, goal_type: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="leads">Leads</SelectItem>
                  <SelectItem value="conversions">Conversions</SelectItem>
                  <SelectItem value="revenue">Revenue</SelectItem>
                  <SelectItem value="impressions">Impressions</SelectItem>
                  <SelectItem value="clicks">Clicks</SelectItem>
                  <SelectItem value="engagement">Engagement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Target Value</Label>
              <Input type="number" value={goalFormData.target_value} onChange={(e) => setGoalFormData({ ...goalFormData, target_value: e.target.value })} required />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setGoalDialogOpen(false)}>Cancel</Button>
              <Button type="submit">Add Goal</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Lead Dialog */}
      <Dialog open={leadDialogOpen} onOpenChange={setLeadDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Lead</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddLead} className="space-y-4">
            <div className="space-y-2">
              <Label>Channel</Label>
              <Select value={leadFormData.channel_id} onValueChange={(value) => setLeadFormData({ ...leadFormData, channel_id: value })}>
                <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No channel</SelectItem>
                  {channels.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Source (utm_source)</Label>
                <Input value={leadFormData.source} onChange={(e) => setLeadFormData({ ...leadFormData, source: e.target.value })} placeholder="e.g. facebook" />
              </div>
              <div className="space-y-2">
                <Label>Medium (utm_medium)</Label>
                <Input value={leadFormData.medium} onChange={(e) => setLeadFormData({ ...leadFormData, medium: e.target.value })} placeholder="e.g. cpc" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={leadFormData.status} onValueChange={(value) => setLeadFormData({ ...leadFormData, status: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="converted">Converted</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={leadFormData.notes} onChange={(e) => setLeadFormData({ ...leadFormData, notes: e.target.value })} rows={2} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLeadDialogOpen(false)}>Cancel</Button>
              <Button type="submit">Add Lead</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Lists Dialog */}
      <Dialog open={listsDialogOpen} onOpenChange={setListsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Marketing Lists</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border rounded-md p-4 max-h-64 overflow-y-auto space-y-2">
              {availableLists.length === 0 ? (
                <p className="text-sm text-muted-foreground">No marketing lists available</p>
              ) : (
                availableLists.map((list) => (
                  <div key={list.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedListIds.includes(list.id)}
                      onCheckedChange={(checked) => {
                        if (checked) setSelectedListIds([...selectedListIds, list.id]);
                        else setSelectedListIds(selectedListIds.filter(id => id !== list.id));
                      }}
                    />
                    <label className="text-sm cursor-pointer flex-1">{list.name}</label>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setListsDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveLists}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Channel Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Channel</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{channelToDelete?.name}"? This will also delete all associated metrics.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setChannelToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteChannel}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CampaignDetail;
