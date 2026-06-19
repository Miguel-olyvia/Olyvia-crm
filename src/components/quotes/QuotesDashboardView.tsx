import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { addDays, parseISO } from "date-fns";
import { AlertCircle, FileText } from "lucide-react";

interface Quote {
  id: string;
  quote_number: string | null;
  estado: string;
  created_at: string;
  accepted_at?: string | null;
  validade_dias?: number | null;
  total?: number | null;
  assigned_to_name?: string;
  lead_source?: string;
}

interface RpcStatusCounts {
  rascunho: number; enviado: number; aceite: number;
  perdido: number; finalizado: number; rejeitado: number; outros: number;
}
interface RpcStatusValues {
  rascunhoValue: number; enviadoValue: number; aceiteValue: number;
  perdidoValue: number; finalizadoValue: number; rejeitadoValue: number; outrosValue: number;
}

interface QuotesDashboardViewProps {
  quotes: Quote[];
  isLoading?: boolean;
  hasError?: boolean;
  errorMessage?: string;
  rpcStatusCounts?: RpcStatusCounts;
  rpcStatusValues?: RpcStatusValues;
}

const normalizeStatus = (status?: string | null) => status || "sem_estado";

const statusMeta: Record<string, { label: string; color: string }> = {
  rascunho: { label: "Rascunho", color: "#94a3b8" },
  enviado: { label: "Enviado", color: "#3b82f6" },
  aceite: { label: "Aceite", color: "#22c55e" },
  perdido: { label: "Perdido", color: "#ef4444" },
  finalizado: { label: "Finalizado", color: "#10b981" },
  rejeitado: { label: "Rejeitado", color: "#f97316" },
  sem_estado: { label: "Sem estado", color: "#71717a" },
};

const FUNNEL_PIPELINE = ["rascunho", "enviado", "aceite", "finalizado"];
const LOST_STATUSES = new Set(["perdido", "rejeitado"]);
const WON_STATUSES = new Set(["aceite", "finalizado"]);
const OPEN_STATUSES = ["rascunho", "enviado"];

// quotes.total is the authoritative DB value. Zero is a valid value.
const valueOf = (q: Quote) => Number(q.total ?? 0);

export function QuotesDashboardView({ quotes, isLoading, hasError, errorMessage, rpcStatusCounts, rpcStatusValues }: QuotesDashboardViewProps) {
  const wonQuotes = useMemo(
    () => quotes.filter(q => WON_STATUSES.has(normalizeStatus(q.estado))),
    [quotes]
  );
  const wonCount = wonQuotes.length;
  const wonValue = useMemo(() => wonQuotes.reduce((s, q) => s + valueOf(q), 0), [wonQuotes]);

  const funnelData = useMemo(() => {
    // Usar dados RPC quando disponíveis (totais correctos), caso contrário fallback local
    const directCount: Record<string, number> = rpcStatusCounts
      ? { rascunho: rpcStatusCounts.rascunho, enviado: rpcStatusCounts.enviado, aceite: rpcStatusCounts.aceite, finalizado: rpcStatusCounts.finalizado, perdido: rpcStatusCounts.perdido, rejeitado: rpcStatusCounts.rejeitado }
      : {};
    const directValue: Record<string, number> = rpcStatusValues
      ? { rascunho: rpcStatusValues.rascunhoValue, enviado: rpcStatusValues.enviadoValue, aceite: rpcStatusValues.aceiteValue, finalizado: rpcStatusValues.finalizadoValue, perdido: rpcStatusValues.perdidoValue, rejeitado: rpcStatusValues.rejeitadoValue }
      : {};
    if (!rpcStatusCounts) {
      quotes.forEach(q => {
        const s = normalizeStatus(q.estado);
        directCount[s] = (directCount[s] || 0) + 1;
        directValue[s] = (directValue[s] || 0) + valueOf(q);
      });
    }
    return FUNNEL_PIPELINE.map((stage, idx) => {
      let count = 0;
      let value = 0;
      for (let i = idx; i < FUNNEL_PIPELINE.length; i++) {
        count += directCount[FUNNEL_PIPELINE[i]] || 0;
        value += directValue[FUNNEL_PIPELINE[i]] || 0;
      }
      const nextStage = FUNNEL_PIPELINE[idx + 1];
      let nextCount = 0;
      if (nextStage) {
        for (let i = idx + 1; i < FUNNEL_PIPELINE.length; i++) {
          nextCount += directCount[FUNNEL_PIPELINE[i]] || 0;
        }
      }
      const conversionRate = count > 0 && nextStage ? Math.round((nextCount / count) * 100) : null;
      return {
        stage,
        label: statusMeta[stage]?.label || stage,
        color: statusMeta[stage]?.color || "#71717a",
        count,
        value,
        conversionRate,
      };
    });
  }, [quotes]);

  const lostSummary = useMemo(() => {
    let count = 0;
    let value = 0;
    quotes.forEach(q => {
      if (LOST_STATUSES.has(normalizeStatus(q.estado))) {
        count++;
        value += valueOf(q);
      }
    });
    return { count, value };
  }, [quotes]);

  const openPipeline = useMemo(
    () => quotes
      .filter(q => OPEN_STATUSES.includes(normalizeStatus(q.estado)))
      .reduce((s, q) => s + valueOf(q), 0),
    [quotes]
  );

  const expiredOpen = useMemo(() => {
    const now = new Date();
    return quotes.filter(q => {
      if (!OPEN_STATUSES.includes(normalizeStatus(q.estado))) return false;
      if (q.validade_dias == null || !q.created_at) return false;
      return addDays(parseISO(q.created_at), q.validade_dias) < now;
    }).length;
  }, [quotes]);

  const byCommercial = useMemo(() => {
    const map: Record<string, { count: number; value: number }> = {};
    quotes.forEach(q => {
      const name = q.assigned_to_name || "Não atribuído";
      if (!map[name]) map[name] = { count: 0, value: 0 };
      map[name].count++;
      map[name].value += valueOf(q);
    });
    return Object.entries(map).sort((a, b) => b[1].value - a[1].value);
  }, [quotes]);

  // Revenue grouped by accepted_at (real won month), not created_at.
  const byMonth = useMemo(() => {
    const map: Record<string, number> = {};
    quotes.forEach(q => {
      if (!WON_STATUSES.has(normalizeStatus(q.estado))) return;
      if (!q.accepted_at) return;
      const month = q.accepted_at.slice(0, 7);
      map[month] = (map[month] || 0) + valueOf(q);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  }, [quotes]);

  const funnelKpis = useMemo(() => {
    const top = funnelData[0];
    const totalEntries = top?.count || 0;
    const overallRate = totalEntries > 0 ? Math.round((wonCount / totalEntries) * 100) : 0;
    const avgTicket = wonCount > 0 ? wonValue / wonCount : 0;
    const lostShare = totalEntries + lostSummary.count > 0
      ? Math.round((lostSummary.count / (totalEntries + lostSummary.count)) * 100)
      : 0;
    let biggestDrop: { from: string; rate: number } = { from: "", rate: 100 };
    for (let i = 0; i < funnelData.length - 1; i++) {
      const r = funnelData[i].conversionRate;
      if (r !== null && r < biggestDrop.rate) biggestDrop = { from: funnelData[i].label, rate: r };
    }
    return { overallRate, avgTicket, lostShare, biggestDrop };
  }, [funnelData, wonCount, wonValue, lostSummary]);

  const maxFunnel = Math.max(...funnelData.map(f => f.count), 1);
  const maxCommercial = Math.max(...byCommercial.map(c => c[1].value), 1);
  const maxMonth = Math.max(...byMonth.map(m => m[1]), 1);

  if (hasError) {
    return (
      <div className="p-4 md:px-6">
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center text-center gap-3">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="font-medium">Não foi possível carregar o dashboard de orçamentos.</p>
            {errorMessage && <p className="text-sm text-muted-foreground">{errorMessage}</p>}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 md:px-6 space-y-6">
        <Skeleton className="h-72 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="p-4 md:px-6">
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center text-center gap-3">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Ainda não existem orçamentos.</p>
            <p className="text-sm text-muted-foreground">Crie o primeiro para começar a ver análises aqui.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:px-6 space-y-6 overflow-y-auto h-full">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Funil de Conversão</CardTitle>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Mostra quantos orçamentos chegaram a cada etapa e quantos avançaram para a seguinte.
            Permite identificar onde se perde negócio, quanto valor está em risco e qual a
            eficiência comercial em transformar pedidos em receita.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <div className="rounded-md border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Taxa global</p>
              <p className="text-lg font-bold tabular-nums">{funnelKpis.overallRate}%</p>
              <p className="text-[10px] text-muted-foreground">Pedidos → Receita</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Receita ganha</p>
              <p className="text-lg font-bold tabular-nums">{formatCurrency(wonValue)}</p>
              <p className="text-[10px] text-muted-foreground">{wonCount} orçamentos ganhos</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ticket médio</p>
              <p className="text-lg font-bold tabular-nums">{formatCurrency(funnelKpis.avgTicket)}</p>
              <p className="text-[10px] text-muted-foreground">Por orçamento ganho</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Maior fuga</p>
              <p className="text-lg font-bold tabular-nums">{funnelKpis.biggestDrop.from || "—"}</p>
              <p className="text-[10px] text-muted-foreground">
                {funnelKpis.biggestDrop.from ? `${100 - funnelKpis.biggestDrop.rate}% perdidos a sair desta etapa` : "Sem dados"}
              </p>
            </div>
            <div className="rounded-md border p-3 col-span-2 lg:col-span-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pipeline em aberto</p>
              <p className="text-lg font-bold tabular-nums">{formatCurrency(openPipeline)}</p>
              <p className="text-[10px] text-muted-foreground">Valor em orçamentos ainda em curso</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Perdas</p>
              <p className="text-lg font-bold tabular-nums text-destructive">{formatCurrency(lostSummary.value)}</p>
              <p className="text-[10px] text-muted-foreground">
                {lostSummary.count} perdidos/rejeitados ({funnelKpis.lostShare}% do total que entrou)
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Expirados em aberto</p>
              <p className="text-lg font-bold tabular-nums">{expiredOpen}</p>
              <p className="text-[10px] text-muted-foreground">Orçamentos abertos para além da validade</p>
            </div>
          </div>

          <div className="space-y-3">
            {funnelData.map((item, idx) => (
              <div key={item.stage}>
                <div className="flex items-center gap-3">
                  <div className="w-24 text-sm font-medium truncate">{item.label}</div>
                  <div
                    className="flex-1 h-8 bg-muted rounded-md overflow-hidden relative"
                    role="img"
                    aria-label={`${item.label}: ${item.count} orçamentos, ${formatCurrency(item.value)}`}
                  >
                    <div
                      className="h-full rounded-md transition-all flex items-center px-3"
                      style={{ width: `${Math.max((item.count / maxFunnel) * 100, 8)}%`, backgroundColor: item.color + 'CC' }}
                    >
                      <span className="text-xs font-bold text-white drop-shadow-sm">{item.count}</span>
                    </div>
                  </div>
                  <div className="w-24 text-right text-sm font-medium tabular-nums">{formatCurrency(item.value)}</div>
                </div>
                {item.conversionRate !== null && idx < funnelData.length - 1 && (
                  <div className="ml-24 pl-6 py-0.5 text-xs text-muted-foreground">
                    <span className="text-primary font-semibold">{item.conversionRate}%</span> avançam para a etapa seguinte →
                  </div>
                )}
              </div>
            ))}
          </div>
          {lostSummary.count > 0 && (
            <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
              <span>Fugas do funil (Perdidos / Rejeitados)</span>
              <span className="tabular-nums">
                <span className="font-semibold text-foreground">{lostSummary.count}</span> · {formatCurrency(lostSummary.value)}
              </span>
            </div>
          )}
          <div className="mt-4 pt-3 border-t space-y-1.5 text-[11px] text-muted-foreground leading-relaxed">
            <p className="font-semibold text-foreground text-xs">Como ler estes indicadores</p>
            <p><span className="font-medium text-foreground">Taxa global:</span> dos orçamentos que entraram no funil, quantos % chegaram a receita.</p>
            <p><span className="font-medium text-foreground">Conversão entre etapas:</span> identifica gargalos.</p>
            <p><span className="font-medium text-foreground">Pipeline em aberto:</span> receita potencial ainda viva.</p>
            <p><span className="font-medium text-foreground">Ticket médio:</span> valor médio por orçamento ganho.</p>
            <p><span className="font-medium text-foreground">Expirados em aberto:</span> orçamentos ainda em curso cuja validade já passou — candidatos a revisão ou fecho.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Orçamentos por Comercial</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
              {byCommercial.map(([name, data]) => (
                <div key={name} className="flex items-center gap-3">
                  <div className="w-32 text-sm truncate" title={name}>{name}</div>
                  <div
                    className="flex-1 h-6 bg-muted rounded overflow-hidden"
                    role="img"
                    aria-label={`${name}: ${data.count} orçamentos, ${formatCurrency(data.value)}`}
                  >
                    <div className="h-full bg-primary/70 rounded" style={{ width: `${(data.value / maxCommercial) * 100}%` }} />
                  </div>
                  <Badge variant="secondary" className="text-xs">{data.count}</Badge>
                  <span className="text-xs font-medium tabular-nums w-20 text-right">{formatCurrency(data.value)}</span>
                </div>
              ))}
              {byCommercial.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sem dados</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Receita por Mês (aceitação)</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-40">
              {byMonth.map(([month, value]) => (
                <div
                  key={month}
                  className="flex-1 flex flex-col items-center gap-1"
                  role="img"
                  aria-label={`${month}: ${formatCurrency(value)}`}
                >
                  <span className="text-xs font-medium tabular-nums">{formatCurrency(value)}</span>
                  <div className="w-full bg-muted rounded-t overflow-hidden flex-1 flex items-end">
                    <div className="w-full bg-primary/60 rounded-t transition-all" style={{ height: `${(value / maxMonth) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{month.slice(5)}/{month.slice(2, 4)}</span>
                </div>
              ))}
              {byMonth.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4 w-full">
                  Sem orçamentos ganhos com data de aceitação registada.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
