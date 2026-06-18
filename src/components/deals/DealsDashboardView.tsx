import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { differenceInDays, parseISO, format } from "date-fns";
import { pt } from "date-fns/locale";
import { useTranslation } from "@/hooks/useTranslation";
import { getDealStageLabel, isWonStage, isLostStage } from "@/lib/dealStageUtils";

interface DealStageRel {
  id: string;
  name: string;
  color: string;
  stage_key?: string | null;
  is_won?: boolean | null;
  is_lost?: boolean | null;
  is_final?: boolean | null;
}

interface Deal {
  id: string;
  title: string;
  value: number;
  probability: number;
  created_at: string;
  closed_at: string | null;
  lost_reason: string | null;
  assigned_to_name?: string | null;
  lead_source?: string | null;
  deal_stages: DealStageRel | null;
}

interface Stage {
  id: string;
  name: string;
  color: string;
  order_index: number;
  stage_key?: string | null;
  is_won?: boolean | null;
  is_lost?: boolean | null;
  is_final?: boolean | null;
}

interface DealsDashboardViewProps {
  deals: Deal[];
  stages: Stage[];
  formatCurrency: (value: number) => string;
  isLoading?: boolean;
  hasError?: boolean;
}

export function DealsDashboardView({ deals, stages, formatCurrency, isLoading, hasError }: DealsDashboardViewProps) {
  const { t } = useTranslation();

  const data = useMemo(() => {
    const sortedStages = [...stages].sort((a, b) => a.order_index - b.order_index);
    const funnelData = sortedStages.map((stage, idx) => {
      const stageDeals = deals.filter(d => d.deal_stages?.id === stage.id);
      const count = stageDeals.length;
      const value = stageDeals.reduce((s, d) => s + (d.value || 0), 0);
      const nextStage = sortedStages[idx + 1];
      const nextCount = nextStage ? deals.filter(d => d.deal_stages?.id === nextStage.id).length : 0;
      const conversionRate = count > 0 && nextStage ? Math.round((nextCount / count) * 100) : null;
      return { stage, count, value, conversionRate };
    });

    const wonDeals = deals.filter(d => isWonStage(d.deal_stages) && d.closed_at != null);
    const avgCloseTime = wonDeals.length === 0
      ? null
      : Math.round(
          wonDeals.reduce((sum, d) => sum + differenceInDays(parseISO(d.closed_at as string), parseISO(d.created_at)), 0) / wonDeals.length
        );

    const bySalespersonMap: Record<string, { count: number; value: number }> = {};
    deals.forEach(d => {
      const name = d.assigned_to_name || "Não atribuído";
      if (!bySalespersonMap[name]) bySalespersonMap[name] = { count: 0, value: 0 };
      bySalespersonMap[name].count++;
      bySalespersonMap[name].value += d.value || 0;
    });
    const bySalesperson = Object.entries(bySalespersonMap).sort((a, b) => b[1].value - a[1].value);

    const bySourceMap: Record<string, { count: number; value: number }> = {};
    deals.forEach(d => {
      const key = ((d.lead_source ?? "Manual").toLowerCase().trim() || "manual");
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      if (!bySourceMap[label]) bySourceMap[label] = { count: 0, value: 0 };
      bySourceMap[label].count++;
      bySourceMap[label].value += d.value || 0;
    });
    const bySource = Object.entries(bySourceMap).sort((a, b) => b[1].count - a[1].count);

    const byMonthMap: Record<string, number> = {};
    wonDeals.forEach(d => {
      const month = (d.closed_at as string).slice(0, 7);
      byMonthMap[month] = (byMonthMap[month] || 0) + (d.value || 0);
    });
    const byMonth = Object.entries(byMonthMap).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);

    const expectedValue = deals
      .filter(d => !isWonStage(d.deal_stages) && !isLostStage(d.deal_stages))
      .reduce((sum, d) => sum + (d.value || 0) * (d.probability || 0) / 100, 0);

    return {
      funnelData,
      wonDeals,
      avgCloseTime,
      bySalesperson,
      bySource,
      byMonth,
      expectedValue,
      maxFunnelCount: Math.max(...funnelData.map(f => f.count), 1),
      maxSalespersonValue: Math.max(...bySalesperson.map(s => s[1].value), 1),
      maxMonthValue: Math.max(...byMonth.map(m => m[1]), 1),
    };
  }, [deals, stages]);

  if (hasError) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Erro a carregar dados do dashboard.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 md:px-6 space-y-6 overflow-y-auto h-full">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6 h-40 bg-muted/40 rounded" />
          </Card>
        ))}
      </div>
    );
  }

  const { funnelData, avgCloseTime, bySalesperson, bySource, byMonth, expectedValue, maxFunnelCount, maxSalespersonValue, maxMonthValue } = data;

  return (
    <div className="p-4 md:px-6 space-y-6 overflow-y-auto h-full">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Valor Esperado</CardTitle></CardHeader>
          <CardContent><span className="text-2xl font-bold">{formatCurrency(expectedValue)}</span></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Tempo Médio de Fecho</CardTitle></CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">{avgCloseTime == null ? "—" : `${avgCloseTime} dias`}</span>
            {avgCloseTime == null && <p className="text-xs text-muted-foreground mt-1">Sem deals ganhos com data de fecho registada.</p>}
          </CardContent>
        </Card>
      </div>

      {/* Conversion Funnel */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Funil de Conversão</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {funnelData.map((item, idx) => {
              const label = getDealStageLabel(item.stage, t);
              return (
                <div key={item.stage.id}>
                  <div className="flex items-center gap-3">
                    <div className="w-28 text-sm font-medium truncate" title={label}>{label}</div>
                    <div className="flex-1 h-8 bg-muted rounded-md overflow-hidden relative">
                      <div
                        className="h-full rounded-md transition-all flex items-center px-3"
                        style={{ width: `${Math.max((item.count / maxFunnelCount) * 100, 8)}%`, backgroundColor: item.stage.color + 'CC' }}
                      >
                        <span className="text-xs font-bold text-white drop-shadow-sm">{item.count}</span>
                      </div>
                    </div>
                    <div className="w-24 text-right text-sm font-medium tabular-nums">{formatCurrency(item.value)}</div>
                  </div>
                  {item.conversionRate !== null && idx < funnelData.length - 1 && (
                    <div className="ml-28 pl-6 py-0.5 text-xs text-muted-foreground flex items-center gap-1">
                      <span className="text-primary font-semibold">{item.conversionRate}%</span> conversão →
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Pedidos por Comercial</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
              {bySalesperson.map(([name, d]) => (
                <div key={name} className="flex items-center gap-3">
                  <div className="w-32 text-sm truncate">{name}</div>
                  <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                    <div className="h-full bg-primary/70 rounded" style={{ width: `${(d.value / maxSalespersonValue) * 100}%` }} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{d.count}</Badge>
                    <span className="text-xs font-medium tabular-nums w-20 text-right">{formatCurrency(d.value)}</span>
                  </div>
                </div>
              ))}
              {bySalesperson.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sem dados</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Pedidos por Origem</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {bySource.map(([name, d]) => (
                <div key={name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{name}</Badge>
                    <span className="text-sm font-medium">{d.count} pedidos</span>
                  </div>
                  <span className="text-sm font-medium tabular-nums">{formatCurrency(d.value)}</span>
                </div>
              ))}
              {bySource.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sem dados</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Receita por Mês (Ganhos)</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 h-40">
            {byMonth.map(([month, value]) => (
              <div key={month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs font-medium tabular-nums">{formatCurrency(value)}</span>
                <div className="w-full bg-muted rounded-t overflow-hidden flex-1 flex items-end">
                  <div className="w-full bg-primary/60 rounded-t transition-all" style={{ height: `${(value / maxMonthValue) * 100}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground">{format(parseISO(month + "-01"), "MM/yy", { locale: pt })}</span>
              </div>
            ))}
            {byMonth.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4 w-full">Sem deals ganhos com data de fecho registada.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
