import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface QuoteLinesAgg {
  quoteId: string;
  totalValue: number;
  totalCost: number;
  hasCostData: boolean;
  margin: number;
}

interface Quote {
  id: string;
  quote_number: string | null;
  estado: string;
  created_at: string;
}

interface QuotesMarginsViewProps {
  quotes: Quote[];
  linesAgg: Record<string, QuoteLinesAgg>;
  entityNamesMap: Record<string, string>;
  getEntityId: (q: Quote) => string | undefined;
}

function MarginBadge({ margin }: { margin: number }) {
  if (margin >= 30) return <Badge className="bg-green-500/20 text-green-700 dark:text-green-400">{margin.toFixed(0)}% ✅</Badge>;
  if (margin >= 15) return <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-400">{margin.toFixed(0)}% ⚠</Badge>;
  return <Badge className="bg-red-500/20 text-red-700 dark:text-red-400">{margin.toFixed(0)}% ❌</Badge>;
}

export function QuotesMarginsView({ quotes, linesAgg, entityNamesMap, getEntityId }: QuotesMarginsViewProps) {
  const sortedByMargin = useMemo(() => {
    return quotes
      .filter(q => linesAgg[q.id]?.totalValue > 0 && linesAgg[q.id]?.hasCostData)
      .map(q => ({ ...q, agg: linesAgg[q.id] }))
      .sort((a, b) => (a.agg?.margin || 0) - (b.agg?.margin || 0));
  }, [quotes, linesAgg]);

  const lowMargin = sortedByMargin.filter(q => q.agg.margin < 15);
  const medMargin = sortedByMargin.filter(q => q.agg.margin >= 15 && q.agg.margin < 30);
  const highMargin = sortedByMargin.filter(q => q.agg.margin >= 30);

  const avgMargin = useMemo(() => {
    const withData = sortedByMargin.filter(q => q.agg.totalValue > 0);
    if (withData.length === 0) return 0;
    return withData.reduce((s, q) => s + q.agg.margin, 0) / withData.length;
  }, [sortedByMargin]);

  return (
    <div className="p-4 md:px-6 space-y-6 overflow-y-auto h-full">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">Margem Média Global</div>
            <div className={cn("text-2xl font-bold mt-1", avgMargin >= 30 ? "text-green-600" : avgMargin >= 15 ? "text-amber-600" : "text-red-600")}>
              {avgMargin.toFixed(1)}%
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> Margem Alta (&gt;30%)
            </div>
            <div className="text-2xl font-bold text-green-700 dark:text-green-400 mt-1">{highMargin.length}</div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 font-medium">
              <TrendingUp className="h-3.5 w-3.5" /> Margem Média (15-30%)
            </div>
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1">{medMargin.length}</div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-red-700 dark:text-red-400 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" /> Margem Baixa (&lt;15%)
            </div>
            <div className="text-2xl font-bold text-red-700 dark:text-red-400 mt-1">{lowMargin.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Ranking by margin */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Ranking por Margem (menor → maior)</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {sortedByMargin.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sem dados de margens</p>}
            {sortedByMargin.map(q => {
              const entityId = getEntityId(q);
              const clientName = entityId ? entityNamesMap[entityId] || "—" : "—";
              return (
                <div key={q.id} className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border",
                  q.agg.margin < 15 && "bg-red-50/50 dark:bg-red-950/20 border-red-200",
                  q.agg.margin >= 15 && q.agg.margin < 30 && "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200",
                  q.agg.margin >= 30 && "bg-green-50/50 dark:bg-green-950/20 border-green-200",
                )}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{q.quote_number || "—"}</span>
                      <span className="text-xs text-muted-foreground truncate">{clientName}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Valor: {formatCurrency(q.agg.totalValue)} · Custo: {formatCurrency(q.agg.totalCost)}
                    </div>
                  </div>
                  <MarginBadge margin={q.agg.margin} />
                  <Badge variant="outline" className="text-xs capitalize">{q.estado}</Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
