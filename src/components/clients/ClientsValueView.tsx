import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LabelList } from "recharts";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, Trophy, Rocket, Phone, FileText, DollarSign, Users, RefreshCw, Sparkles, Info } from "lucide-react";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { format, subMonths, startOfMonth, endOfMonth, differenceInDays } from "date-fns";
import { pt } from "date-fns/locale";
import type { ClientHealthScore, ClientContractInfo, ClientTag, ClientInteractionInfo } from "@/hooks/useClientEnrichedData";

interface ClientsValueViewProps {
  clients: { id: string; entity_id: string; status: string; created_at: string; assigned_to?: string | null }[];
  healthScores: Map<string, ClientHealthScore>;
  contracts: Map<string, ClientContractInfo>;
  interactions: Map<string, ClientInteractionInfo>;
  tags: Map<string, ClientTag[]>;
  identityMap: Record<string, { display_name?: string; email?: string | null }>;
  scopeOrgIds: string[];
  onOpenClient?: (entityId: string) => void;
  onCreateDeal?: (entityId: string) => void;
}

interface FullContract {
  id: string;
  entity_id: string | null;
  status: string;
  total_value: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  payment_terms: string | null;
  notes: string | null;
}

const DONUT_COLORS = ["hsl(270, 70%, 55%)", "hsl(220, 70%, 55%)", "hsl(160, 60%, 45%)", "hsl(40, 80%, 55%)", "hsl(0, 60%, 55%)", "hsl(300, 50%, 55%)"];

// Statuses que representam receita comprometida/histórica.
// reserved: adicionar "completed" se este status for introduzido no futuro.
const REVENUE_STATUSES = new Set(["signed", "active", "expired"]);

const RANK_STYLES: Record<number, { bg: string; text: string; ring: string }> = {
  1: { bg: "bg-yellow-400", text: "text-yellow-900", ring: "ring-yellow-400/40" },
  2: { bg: "bg-gray-300", text: "text-gray-800", ring: "ring-gray-300/40" },
  3: { bg: "bg-amber-600", text: "text-amber-100", ring: "ring-amber-600/40" },
};

export function ClientsValueView({
  clients, healthScores, contracts, interactions, tags, identityMap, scopeOrgIds,
  onOpenClient, onCreateDeal,
}: ClientsValueViewProps) {
  const [allContracts, setAllContracts] = useState<FullContract[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(true);

  // Load full contracts for deeper analytics
  useEffect(() => {
    const load = async () => {
      setLoadingContracts(true);
      try {
        const entityIds = clients.map(c => c.entity_id).filter(Boolean);
        if (entityIds.length === 0) { setAllContracts([]); return; }
        const all: FullContract[] = [];
        for (let i = 0; i < entityIds.length; i += 100) {
          const batch = entityIds.slice(i, i + 100);
          const { data } = await supabase.from("client_contracts")
            .select("id, entity_id, status, total_value, start_date, end_date, created_at, payment_terms, notes")
            .in("entity_id", batch);
          if (data) all.push(...(data as FullContract[]));
        }
        setAllContracts(all);
      } catch (err) {
        console.error("Error loading contracts for value view:", err);
      } finally {
        setLoadingContracts(false);
      }
    };
    load();
  }, [clients]);

  const revenueContracts = useMemo(() =>
    allContracts.filter(c => REVENUE_STATUSES.has(c.status)),
    [allContracts]
  );

  // ── KPIs ──
  const kpis = useMemo(() => {
    const totalRevenue = revenueContracts.reduce((sum, c) => sum + (c.total_value || 0), 0);
    const clientCount = clients.filter(c => c.status === "active").length;
    const avgPerClient = clientCount > 0 ? totalRevenue / clientCount : 0;

    // Recurring: contracts with payment_terms containing "mensal", "monthly", "recorrente"
    const recurringContracts = revenueContracts.filter(c => {
      const pt = (c.payment_terms || "").toLowerCase();
      const notes = (c.notes || "").toLowerCase();
      return pt.includes("mensal") || pt.includes("monthly") || pt.includes("recorrente") ||
        notes.includes("recorrente") || notes.includes("mensal");
    });
    const recurringRevenue = recurringContracts.reduce((sum, c) => sum + (c.total_value || 0), 0);

    // Lifetime value: total committed revenue / distinct entities with revenue contracts
    const revenueEntities = new Set(revenueContracts.map(c => c.entity_id).filter(Boolean));
    const totalLifetime = revenueContracts.reduce((sum, c) => sum + (c.total_value || 0), 0);
    const avgLifetime = revenueEntities.size > 0 ? totalLifetime / revenueEntities.size : 0;

    return { totalRevenue, avgPerClient, recurringRevenue, recurringCount: recurringContracts.length, avgLifetime, clientCount };
  }, [revenueContracts, clients]);

  // ── Top 10 Clients ──
  const topClients = useMemo(() => {
    const entityValueMap = new Map<string, { totalValue: number; contractCount: number; clientSince: string; tags: string[] }>();
    for (const c of revenueContracts) {
      if (!c.entity_id) continue;
      const existing = entityValueMap.get(c.entity_id) || { totalValue: 0, contractCount: 0, clientSince: c.created_at, tags: [] };
      existing.totalValue += c.total_value || 0;
      existing.contractCount++;
      if (c.created_at < existing.clientSince) existing.clientSince = c.created_at;
      entityValueMap.set(c.entity_id, existing);
    }
    // Merge tags
    for (const [eid, data] of entityValueMap) {
      const clientTags = tags.get(eid) || [];
      data.tags = clientTags.map(t => t.tag);
      // Check if recurring (only revenue contracts)
      const pt = (revenueContracts.find(c => c.entity_id === eid)?.payment_terms || "").toLowerCase();
      if (pt.includes("mensal") || pt.includes("recorrente")) {
        if (!data.tags.includes("Recorrente")) data.tags.push("Recorrente");
      }
    }

    const maxVal = Math.max(...Array.from(entityValueMap.values()).map(v => v.totalValue), 1);

    return Array.from(entityValueMap.entries())
      .map(([eid, data]) => ({
        entityId: eid,
        name: identityMap[eid]?.display_name || "N/A",
        initials: (identityMap[eid]?.display_name || "??").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase(),
        ...data,
        barPct: (data.totalValue / maxVal) * 100,
        clientSinceLabel: format(new Date(data.clientSince), "MMM/yyyy", { locale: pt }),
        // Check expiring
        expiringDays: (() => {
          const contract = contracts.get(eid);
          if (contract?.expiringContracts.length) {
            return differenceInDays(new Date(contract.expiringContracts[0].end_date), new Date());
          }
          return null;
        })(),
      }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 10);
  }, [revenueContracts, identityMap, tags, contracts]);

  // ── Monthly Revenue (last 6 months) ──
  const monthlyRevenue = useMemo(() => {
    const months: { month: Date; label: string; value: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const start = startOfMonth(monthDate);
      const end = endOfMonth(monthDate);
      const value = revenueContracts
        .filter(c => {
          const d = new Date(c.start_date || c.created_at);
          return d >= start && d <= end;
        })
        .reduce((sum, c) => sum + (c.total_value || 0), 0);
      months.push({
        month: monthDate,
        label: format(monthDate, "MMM", { locale: pt }).charAt(0).toUpperCase() + format(monthDate, "MMM", { locale: pt }).slice(1),
        value,
      });
    }
    // Growth calculation
    const nonZero = months.filter(m => m.value > 0);
    let avgGrowth = 0;
    if (nonZero.length >= 2) {
      let totalGrowth = 0;
      let growthCount = 0;
      for (let i = 1; i < months.length; i++) {
        if (months[i - 1].value > 0) {
          totalGrowth += ((months[i].value - months[i - 1].value) / months[i - 1].value) * 100;
          growthCount++;
        }
      }
      avgGrowth = growthCount > 0 ? totalGrowth / growthCount : 0;
    }
    return { months, avgGrowth };
  }, [revenueContracts]);

  // ── Revenue Distribution (by payment_terms as category proxy) ──
  const revenueDistribution = useMemo(() => {
    const categoryMap = new Map<string, number>();
    for (const c of revenueContracts) {
      const category = c.payment_terms || c.notes?.split(" ")[0] || "Outros";
      const label = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
      categoryMap.set(label, (categoryMap.get(label) || 0) + (c.total_value || 0));
    }
    // If too many categories, keep top 5 and group rest as "Outros"
    const entries = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1]);
    const top5 = entries.slice(0, 5);
    const othersValue = entries.slice(5).reduce((sum, [, v]) => sum + v, 0);
    if (othersValue > 0) top5.push(["Outros", othersValue]);
    const total = top5.reduce((sum, [, v]) => sum + v, 0);
    return {
      data: top5.map(([name, value], i) => ({
        name,
        value,
        pct: total > 0 ? Math.round((value / total) * 100) : 0,
        fill: DONUT_COLORS[i % DONUT_COLORS.length],
      })),
      total,
    };
  }, [revenueContracts]);

  // ── Upselling Opportunities ──
  const upsellOpportunities = useMemo(() => {
    const now = new Date();
    const avgValue = kpis.clientCount > 0 ? kpis.totalRevenue / kpis.clientCount : 0;
    const opportunities: {
      entityId: string; name: string; initials: string; value: number;
      reason: string; action: "deal" | "contact"; potentialValue: number;
    }[] = [];

    for (const client of clients.filter(c => c.status === "active")) {
      const eid = client.entity_id;
      const contract = contracts.get(eid);
      const interaction = interactions.get(eid);
      const name = identityMap[eid]?.display_name || "N/A";
      const initials = name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
      const clientValue = contract?.totalValue || 0;

      // 1. Only 1 contract and below average
      if (contract && contract.activeCount === 1 && clientValue < avgValue) {
        opportunities.push({
          entityId: eid, name, initials, value: clientValue,
          reason: `Só 1 contrato · Valor abaixo da média (${formatCurrency(avgValue)}) · Potencial de +${formatCurrency(avgValue - clientValue)}`,
          action: "deal",
          potentialValue: avgValue - clientValue,
        });
        continue;
      }

      // 2. No contact > 42 days (reactivation needed)
      if (interaction?.lastInteractionAt) {
        const daysSince = differenceInDays(now, new Date(interaction.lastInteractionAt));
        if (daysSince > 42 && contract && contract.activeCount >= 1) {
          opportunities.push({
            entityId: eid, name, initials, value: clientValue,
            reason: `Só ${contract.activeCount} contrato · Sem contacto ${daysSince} dias · Reactivar primeiro`,
            action: "contact",
            potentialValue: avgValue * 0.3,
          });
          continue;
        }
      }

      // 3. Active with good health but no new deal > 60 days
      const health = healthScores.get(eid);
      if (health && health.score >= 60 && contract && contract.activeCount >= 1) {
        if (!interaction?.lastInteractionAt || differenceInDays(now, new Date(interaction.lastInteractionAt)) > 60) {
          opportunities.push({
            entityId: eid, name, initials, value: clientValue,
            reason: `Cliente saudável (${health.score}%) · Sem pedido novo há +60 dias · Oportunidade de cross-sell`,
            action: "deal",
            potentialValue: avgValue * 0.5,
          });
        }
      }
    }

    return opportunities
      .sort((a, b) => b.potentialValue - a.potentialValue)
      .slice(0, 6);
  }, [clients, contracts, interactions, healthScores, identityMap, kpis]);

  const totalUpsellPotential = useMemo(() =>
    upsellOpportunities.reduce((sum, o) => sum + o.potentialValue, 0),
    [upsellOpportunities]
  );

  const formatCompact = (val: number) => {
    if (val >= 1000) return `€${(val / 1000).toFixed(1)}k`;
    return formatCurrency(val);
  };

  // Avatar color map by position
  const avatarColors = ["bg-purple-500", "bg-blue-500", "bg-emerald-500", "bg-orange-500", "bg-red-500", "bg-indigo-500", "bg-teal-500", "bg-pink-500", "bg-cyan-500", "bg-amber-500"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <span className="text-lg">💰</span> Valor — Análise de Receita
        </h2>
        <p className="text-sm text-muted-foreground">Quem são os teus clientes mais valiosos e onde está o dinheiro</p>
      </div>

      {/* KPI Cards */}
      <TooltipProvider delayDuration={150}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] font-semibold text-muted-foreground tracking-wider uppercase flex items-center gap-1">
              Receita Total
              <UITooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 text-muted-foreground/70 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  Inclui contratos assinados, activos e expirados. Drafts e cancelados não contam.
                </TooltipContent>
              </UITooltip>
            </p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{formatCurrency(kpis.totalRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-green-500" />
              {kpis.clientCount} clientes activos
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] font-semibold text-muted-foreground tracking-wider uppercase">Valor Médio / Cliente</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(kpis.avgPerClient)}</p>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Users className="w-3 h-3" />
              {kpis.clientCount} clientes
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] font-semibold text-muted-foreground tracking-wider uppercase flex items-center gap-1">
              Receita Recorrente
              <UITooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 text-muted-foreground/70 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  Receita comprometida/histórica com cadência mensal (payment_terms). Pode incluir contratos expirados.
                </TooltipContent>
              </UITooltip>
            </p>
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">{formatCurrency(kpis.recurringRevenue)}<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
            <p className="text-xs text-muted-foreground mt-0.5">{kpis.recurringCount} contratos recorrentes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] font-semibold text-muted-foreground tracking-wider uppercase">Lifetime Value Médio</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(kpis.avgLifetime)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Desde que são clientes</p>
          </CardContent>
        </Card>
      </div>
      </TooltipProvider>

      {/* Main Grid: Top Clients + Monthly Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Clients */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-500" /> Top Clientes por Valor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {topClients.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Sem dados de contratos</p>
            )}
            {topClients.map((client, i) => {
              const rank = i + 1;
              const rankStyle = RANK_STYLES[rank] || { bg: "bg-muted", text: "text-muted-foreground", ring: "" };
              return (
                <div
                  key={client.entityId}
                  className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group"
                  onClick={() => onOpenClient?.(client.entityId)}
                >
                  {/* Rank badge */}
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${rankStyle.bg} ${rankStyle.text} ${rankStyle.ring} ring-2 shrink-0`}>
                    {rank}
                  </div>

                  {/* Avatar */}
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${avatarColors[i % avatarColors.length]}`}>
                    {client.initials}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{client.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                      {client.contractCount} contrato{client.contractCount > 1 ? "s" : ""}
                      <span>·</span>
                      Cliente desde {client.clientSinceLabel}
                      {client.tags.length > 0 && (
                        <>
                          <span>·</span>
                          {client.tags.slice(0, 2).map(t => (
                            <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0 h-4">{t}</Badge>
                          ))}
                        </>
                      )}
                      {client.expiringDays !== null && client.expiringDays >= 0 && (
                        <>
                          <span>·</span>
                          <span className="text-yellow-600 font-medium">Expira em {client.expiringDays}d</span>
                        </>
                      )}
                    </p>
                  </div>

                  {/* Value + bar */}
                  <div className="text-right shrink-0 w-28">
                    <p className="text-sm font-bold text-green-600 dark:text-green-400">{formatCurrency(client.totalValue)}</p>
                    <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                      <div
                        className="bg-gradient-to-r from-purple-500 to-purple-400 h-1.5 rounded-full transition-all"
                        style={{ width: `${client.barPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Monthly Revenue */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-500" /> Receita por Mês (últimos 6 meses)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyRevenue.months} barSize={40}>
                <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), "Receita"]}
                  contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="hsl(var(--primary) / 0.3)">
                  <LabelList dataKey="value" position="top" formatter={(v: number) => formatCompact(v)} style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }} />
                  {monthlyRevenue.months.map((_, i) => (
                    <Cell
                      key={i}
                      fill={i === monthlyRevenue.months.length - 1 ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.35)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {monthlyRevenue.avgGrowth !== 0 && (
              <div className="flex justify-center mt-2">
                <p className="text-sm text-purple-600 dark:text-purple-400 font-medium flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" />
                  ↑ Crescimento médio de {Math.abs(monthlyRevenue.avgGrowth).toFixed(0)}% ao mês
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Second Grid: Distribution + Upselling */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue Distribution Donut */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              📊 Distribuição de Receita
            </CardTitle>
          </CardHeader>
          <CardContent>
            {revenueDistribution.data.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem dados suficientes</p>
            ) : (
              <div className="flex items-center gap-6">
                <div className="relative w-[180px] h-[180px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={revenueDistribution.data}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {revenueDistribution.data.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-lg font-bold">{formatCompact(revenueDistribution.total)}</span>
                    <span className="text-[10px] text-muted-foreground">Total</span>
                  </div>
                </div>
                {/* Legend */}
                <div className="flex-1 space-y-2">
                  {revenueDistribution.data.map((entry, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: entry.fill }} />
                      <span className="flex-1 truncate font-medium">{entry.name}:</span>
                      <span className="text-muted-foreground">{formatCurrency(entry.value)} ({entry.pct}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upselling Opportunities */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Rocket className="w-4 h-4 text-purple-500" /> Oportunidades de Upselling
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upsellOpportunities.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma oportunidade identificada 🎉</p>
            ) : (
              <>
                {upsellOpportunities.map((opp, i) => (
                  <div key={opp.entityId} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:border-border transition-colors">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${avatarColors[i % avatarColors.length]}`}>
                      {opp.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">
                        {opp.name} — <span className="text-green-600 dark:text-green-400">{formatCurrency(opp.value)}</span>
                      </p>
                      <p className="text-xs text-muted-foreground leading-snug">{opp.reason}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={opp.action === "deal" ? "default" : "outline"}
                      className={`gap-1.5 shrink-0 ${opp.action === "deal" ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (opp.action === "deal") onCreateDeal?.(opp.entityId);
                        else onOpenClient?.(opp.entityId);
                      }}
                    >
                      {opp.action === "deal" ? (
                        <><FileText className="w-3.5 h-3.5" /> Novo Pedido</>
                      ) : (
                        <><Phone className="w-3.5 h-3.5" /> Contactar</>
                      )}
                    </Button>
                  </div>
                ))}

                {/* Total potential */}
                <div className="bg-green-50 dark:bg-green-950/20 border border-green-200/50 dark:border-green-800/50 rounded-lg p-3 text-center mt-3">
                  <p className="text-sm font-semibold text-green-700 dark:text-green-400 flex items-center justify-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Potencial de upselling total: {formatCurrency(totalUpsellPotential)}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
