import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
  ComposedChart, Bar, Line, Legend,
} from "recharts";

interface Props { data: any }

const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("pt-PT").format(Number(n));
const fmtCur = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(n));
const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${(Number(n) * 100).toFixed(1)}%`;

const formatBucketLabel = (value: string, bucket: string | undefined) => {
  if (!value) return "";
  if (bucket === "year") return value.slice(0, 4);
  if (bucket === "month") {
    const [y, m] = value.slice(0, 7).split("-");
    return `${m}/${y}`;
  }
  const [, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}`;
};


function Kpi({ label, value, hint, size = "lg" }: { label: string; value: string; hint?: string; size?: "lg" | "sm" }) {
  return (
    <Card>
      <CardContent className={size === "lg" ? "py-4" : "py-3"}>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {label}
          {hint && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild><Info className="w-3 h-3 cursor-help" /></TooltipTrigger>
                <TooltipContent><p className="max-w-xs text-xs">{hint}</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className={size === "lg" ? "text-2xl font-semibold mt-1" : "text-lg font-medium mt-1"}>{value}</div>
      </CardContent>
    </Card>
  );
}

export function ChannelOverviewTab({ data }: Props) {
  const s = data?.summary ?? {};
  const top = data?.top_origins ?? [];
  const series = data?.series ?? [];
  const bucket = data?.window?.bucket as string | undefined;
  const unattributed = data?.unattributed?.leads ?? 0;

  const hasAttribContracts = (s.attributed_contracts_count ?? 0) > 0;

  return (
    <div className="space-y-6 mt-4">
      {/* Bloco A — Negócio */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Leads" value={fmtNum(s.leads)} hint="Número de leads atribuídos a este canal no intervalo (last-touch)." />
        <Kpi label="Conversões" value={fmtNum(s.conversions)} hint="Leads que se converteram em cliente." />
        <Kpi label="CPL" value={fmtCur(s.cpl)} hint="CPL = Custo Por Lead. Fórmula: spend canónico ÷ leads." />
        <Kpi label="CAC" value={fmtCur(s.cac)} hint="CAC = Custo de Aquisição de Cliente. Fórmula: spend canónico ÷ conversões." />
        <Kpi label="Receita atribuída" value={fmtCur(s.revenue)}
          hint="Soma do valor dos contratos atribuídos a este canal por last-touch (janela 90d). Estados elegíveis: signed/active/expired." />
        <Kpi label="Spend canónico" value={fmtCur(s.spend)}
          hint="Somatório de channel_spend_entries (one-time + recurring expandido) no intervalo. Fonte oficial de custo." />
        {hasAttribContracts && <Kpi label="ROAS" value={fmtNum(s.roas)} hint="ROAS = Return On Ad Spend. Fórmula: receita atribuída ÷ spend canónico." />}
        {hasAttribContracts && <Kpi label="ROI" value={fmtPct(s.roi)} hint="ROI = Return On Investment. Fórmula: (receita − spend) ÷ spend." />}
        {hasAttribContracts && <Kpi label="Profit" value={fmtCur(s.profit)} hint="Lucro = receita atribuída − spend canónico." />}
      </div>

      {/* Bloco B — Gráficos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Leads vs Conversões</CardTitle></CardHeader>
          <CardContent>
            {series.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">Sem dados no intervalo.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={series}>
                  <defs>
                    <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gConv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} tickFormatter={(v) => formatBucketLabel(v, bucket)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RTooltip labelFormatter={(v) => formatBucketLabel(String(v), bucket)} />

                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="leads" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#gLeads)" name="Leads" />
                  <Area type="monotone" dataKey="conversions" stroke="hsl(var(--success))" fillOpacity={1} fill="url(#gConv)" name="Conversões" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Spend vs Receita</CardTitle></CardHeader>
          <CardContent>
            {!hasAttribContracts ? (
              <p className="text-sm text-muted-foreground py-12 text-center">
                Sem contratos atribuídos para comparar Spend vs Receita.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} tickFormatter={(v) => formatBucketLabel(v, bucket)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RTooltip labelFormatter={(v) => formatBucketLabel(String(v), bucket)} />

                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="spend" fill="hsl(var(--muted-foreground))" name="Spend" />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--success))" strokeWidth={2} name="Receita" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bloco C — Métricas externas */}
      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground">Métricas externas</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Impressions" value={fmtNum(s.impressions)} size="sm" />
            <Kpi label="Clicks" value={fmtNum(s.clicks)} size="sm" />
            <Kpi label="Opens" value={fmtNum(s.opens)} size="sm" />
            <Kpi label="Bounces" value={fmtNum(s.bounces)} size="sm" />
            <Kpi label="Spend importado" value={fmtCur(s.spend_imported)} size="sm"
              hint="channel_metrics.spend, separado e nunca somado ao spend canónico." />
            <Kpi label="Leads sem atribuição" value={fmtNum(unattributed)} size="sm"
              hint="Leads da campanha sem canal atribuído." />
          </div>
        </CardContent>
      </Card>

      {/* Top origens */}
      <Card>
        <CardHeader><CardTitle className="text-base">Top origens</CardTitle></CardHeader>
        <CardContent>
          {top.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados no intervalo.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2">Source</th>
                    <th>Medium</th>
                    <th className="text-right">Leads</th>
                    <th className="text-right">Conversões</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((o: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2">{o.source ?? "—"}</td>
                      <td>{o.medium ?? "—"}</td>
                      <td className="text-right">{fmtNum(o.leads)}</td>
                      <td className="text-right">{fmtNum(o.conversions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
