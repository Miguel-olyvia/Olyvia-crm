import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompany } from "@/contexts/CompanyContext";
import { ChevronLeft, RefreshCw, AlertCircle } from "lucide-react";
import { ChannelOverviewTab } from "@/components/channels/ChannelOverviewTab";
import { ChannelLeadsTab } from "@/components/channels/ChannelLeadsTab";
import { ChannelSpendScheduleTab } from "@/components/channels/ChannelSpendScheduleTab";
import { ChannelReportsTab } from "@/components/channels/ChannelReportsTab";
import { ChannelSettingsTab } from "@/components/channels/ChannelSettingsTab";

function defaultRangeFor(bucket: "day" | "week" | "month" | "year") {
  const to = new Date();
  const from = new Date();
  if (bucket === "day") from.setDate(to.getDate() - 1);
  else if (bucket === "week") from.setDate(to.getDate() - 7);
  else if (bucket === "month") from.setMonth(to.getMonth() - 1);
  else from.setFullYear(to.getFullYear() - 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

const ChannelDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasAnyPermission, hasPermission } = usePermissions();
  const { activeCompany } = useCompany();

  const [bucket, setBucket] = useState<"day" | "week" | "month" | "year">("day");
  const [range, setRange] = useState(() => defaultRangeFor("day"));
  const [rangeTouched, setRangeTouched] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const canManageSpend = hasAnyPermission(["channels.create", "channels.edit", "channels.delete"]);
  const canEditSettings = hasPermission("channels.edit");

  const availableTabs = useMemo(() => {
    const tabs = ["overview", "leads"];
    if (canManageSpend) tabs.push("spend");
    tabs.push("reports");
    if (canEditSettings) tabs.push("settings");
    return tabs;
  }, [canManageSpend, canEditSettings]);

  const tabParam = searchParams.get("tab") ?? "overview";
  const activeTab = availableTabs.includes(tabParam) ? tabParam : "overview";

  useEffect(() => {
    if (tabParam !== activeTab) {
      const next = new URLSearchParams(searchParams);
      next.set("tab", "overview");
      setSearchParams(next, { replace: true });
    }
  }, [tabParam, activeTab, searchParams, setSearchParams]);

  const handleTabChange = (v: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", v);
    setSearchParams(next, { replace: true });
  };

  const queryKey = useMemo(
    () => ["channel-dashboard", id, range.from, range.to, bucket],
    [id, range.from, range.to, bucket]
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const windowDays = Math.max(
        1,
        Math.ceil((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000)
      );
      const { data, error } = await supabase.rpc("get_channel_dashboard", {
        p_channel_id: id!,
        p_date_from: range.from,
        p_date_to: range.to,
        p_bucket: bucket,
        p_window_days: windowDays,
      });
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });

  // Realtime invalidations
  useEffect(() => {
    if (!id) return;
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["channel-dashboard", id] });

    const channels = [
      supabase
        .channel(`cd-leads-${id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "campaign_leads", filter: `channel_id=eq.${id}` }, invalidate)
        .subscribe(),
      supabase
        .channel(`cd-spend-${id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "channel_spend_entries", filter: `channel_id=eq.${id}` }, invalidate)
        .subscribe(),
      supabase
        .channel(`cd-metrics-${id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "channel_metrics", filter: `channel_id=eq.${id}` }, invalidate)
        .subscribe(),
    ];

    if (activeCompany?.id) {
      channels.push(
        supabase
          .channel(`cd-contracts-${id}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "client_contracts", filter: `organization_id=eq.${activeCompany.id}` },
            invalidate
          )
          .subscribe()
      );
    }

    return () => {
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [id, queryClient, activeCompany?.id]);

  if (isLoading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <OlyviaLoader size={40} />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <div className="space-y-4 p-6">
          <Button variant="outline" size="sm" onClick={() => navigate("/channels")}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Voltar a Canais
          </Button>
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <AlertCircle className="w-10 h-10 mx-auto text-destructive" />
              <p className="text-muted-foreground">Erro a carregar dashboard.</p>
              <Button size="sm" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4 mr-1" /> Tentar novamente
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  if (!data || data.error === "channel_not_found") {
    return (
      <>
        <div className="space-y-4 p-6">
          <Button variant="outline" size="sm" onClick={() => navigate("/channels")}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Voltar a Canais
          </Button>
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Canal não encontrado ou sem acesso.</p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const channel = data.channel;

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/campaigns/${channel.campaign_id}?tab=channels`)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{channel.name}</h1>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
                <Badge variant="outline">{channel.type}</Badge>
                <span>·</span>
                <Link to={`/campaigns/${channel.campaign_id}`} className="hover:underline">
                  {channel.campaign_name}
                </Link>
                {channel.is_active ? (
                  <Badge className="bg-success/10 text-success border-0">Ativo</Badge>
                ) : (
                  <Badge variant="secondary">Inativo</Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-end bg-muted/40 rounded-md px-3 py-2 border">
            <div className="space-y-1">
              <Label className="text-xs">De</Label>
              <Input type="date" value={range.from} onChange={(e) => { setRange({ ...range, from: e.target.value }); setRangeTouched(true); }} className="h-9 w-[170px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até</Label>
              <Input type="date" value={range.to} onChange={(e) => { setRange({ ...range, to: e.target.value }); setRangeTouched(true); }} className="h-9 w-[170px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bucket</Label>
              <Select value={bucket} onValueChange={(v: any) => { setBucket(v); }}>

                <SelectTrigger className="h-9 w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Dia</SelectItem>
                  <SelectItem value="week">Semana</SelectItem>
                  <SelectItem value="month">Mês</SelectItem>
                  <SelectItem value="year">Ano</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <div className="overflow-x-auto">
            <TabsList className="flex-nowrap w-max">
              <TabsTrigger value="overview">Visão geral</TabsTrigger>
              <TabsTrigger value="leads">Leads</TabsTrigger>
              {canManageSpend && <TabsTrigger value="spend">Plano de investimento</TabsTrigger>}
              <TabsTrigger value="reports">Relatórios / Atribuição</TabsTrigger>
              {canEditSettings && <TabsTrigger value="settings">Definições</TabsTrigger>}
            </TabsList>
          </div>

          <TabsContent value="overview"><ChannelOverviewTab data={data} /></TabsContent>
          <TabsContent value="leads"><ChannelLeadsTab channelId={id!} range={range} /></TabsContent>
          {canManageSpend && (
            <TabsContent value="spend">
              <ChannelSpendScheduleTab channelId={id!} range={range} activeSpend={data.summary?.spend} />
            </TabsContent>
          )}
          <TabsContent value="reports">
            <ChannelReportsTab data={data} channelId={id!} campaignId={channel.campaign_id} />
          </TabsContent>
          {canEditSettings && (
            <TabsContent value="settings"><ChannelSettingsTab channel={channel} /></TabsContent>
          )}
        </Tabs>
      </div>
    </>
  );
};

export default ChannelDetail;
