import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { ChannelUtmMappings } from "@/components/campaigns/ChannelUtmMappings";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend, ResponsiveContainer,
} from "recharts";

interface Props { data: any; channelId: string; campaignId: string }

function exportCsv(rows: any[], filename: string) {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

const formatBucketLabel = (value: string, bucket: string) => {
  if (!value) return "";
  if (bucket === "year") return value.slice(0, 4);
  if (bucket === "month") {
    const [y, m] = value.slice(0, 7).split("-");
    return `${m}/${y}`;
  }
  const [, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}`;
};

export function ChannelReportsTab({ data, channelId, campaignId }: Props) {
  const series = (data?.series ?? []) as any[];
  const bucket = data?.window?.bucket ?? "day";
  const channels = data?.channel ? [{ id: channelId, name: data.channel.name, type: data.channel.type }] : [];
  const allRevSpendZero = series.length === 0 || series.every(
    (r) => Number(r.revenue ?? 0) === 0 && Number(r.spend ?? 0) === 0
  );

  return (
    <div className="space-y-8 mt-4">
      {/* Relatórios */}
      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold">Relatórios</h2>
          <Button variant="outline" size="sm" onClick={() => exportCsv(series, `channel-${channelId}-series.csv`)} disabled={series.length === 0}>
            <Download className="w-4 h-4 mr-1" /> Exportar CSV
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Leads e Conversões</CardTitle></CardHeader>
            <CardContent>
              {series.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">Sem dados no intervalo.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} tickFormatter={(v) => formatBucketLabel(v, bucket)} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RTooltip labelFormatter={(v) => formatBucketLabel(String(v), bucket)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="leads" stroke="hsl(var(--primary))" strokeWidth={2} name="Leads" />
                    <Line type="monotone" dataKey="conversions" stroke="hsl(var(--success))" strokeWidth={2} name="Conversões" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Spend e Receita</CardTitle></CardHeader>
            <CardContent>
              {allRevSpendZero ? (
                <p className="text-sm text-muted-foreground py-12 text-center">Sem valores de receita ou spend no intervalo.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} tickFormatter={(v) => formatBucketLabel(v, bucket)} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RTooltip labelFormatter={(v) => formatBucketLabel(String(v), bucket)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="spend" fill="hsl(var(--muted-foreground))" name="Spend" />
                    <Bar dataKey="revenue" fill="hsl(var(--success))" name="Receita" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Série temporal</CardTitle></CardHeader>
          <CardContent>
            {series.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados no intervalo.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-2">Bucket</th>
                      <th className="text-right">Leads</th>
                      <th className="text-right">Conversões</th>
                      <th className="text-right">Receita</th>
                      <th className="text-right">Spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {series.map((r: any, i: number) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1.5">{formatBucketLabel(r.bucket, bucket)}</td>
                        <td className="text-right">{r.leads}</td>
                        <td className="text-right">{r.conversions}</td>
                        <td className="text-right">{Number(r.revenue ?? 0).toFixed(2)}</td>
                        <td className="text-right">{Number(r.spend ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <div className="border-t" />

      {/* Atribuição / UTM */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Atribuição / UTM</h2>
          <p className="text-sm text-muted-foreground">Regras de mapeamento UTM → canal para esta campanha.</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <ChannelUtmMappings campaignId={campaignId} channels={channels as any} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
