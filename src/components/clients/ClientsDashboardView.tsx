import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { ClientHealthScore, ClientContractInfo } from "@/hooks/useClientEnrichedData";

interface ClientsDashboardViewProps {
  clients: { id: string; entity_id: string; status: string; created_at: string }[];
  healthScores: Map<string, ClientHealthScore>;
  contracts: Map<string, ClientContractInfo>;
  identityMap: Record<string, { display_name?: string; email?: string | null }>;
  assignedUserMap: Map<string, string>;
  loading?: boolean;
}

const HEALTH_COLORS = { excellent: '#22c55e', good: '#3b82f6', attention: '#eab308', at_risk: '#f97316', critical: '#ef4444' };

export function ClientsDashboardView({ clients, healthScores, contracts, identityMap, assignedUserMap, loading = false }: ClientsDashboardViewProps) {
  // Health distribution
  const healthDist = { excellent: 0, good: 0, attention: 0, at_risk: 0, critical: 0 };
  healthScores.forEach(h => { healthDist[h.level]++; });
  const healthChartData = [
    { name: 'Excelente', value: healthDist.excellent, fill: HEALTH_COLORS.excellent },
    { name: 'Bom', value: healthDist.good, fill: HEALTH_COLORS.good },
    { name: 'Atenção', value: healthDist.attention, fill: HEALTH_COLORS.attention },
    { name: 'Em Risco', value: healthDist.at_risk, fill: HEALTH_COLORS.at_risk },
    { name: 'Crítico', value: healthDist.critical, fill: HEALTH_COLORS.critical },
  ];

  // Top 10 clients by value
  const clientValues = clients
    .map(c => ({
      name: identityMap[c.entity_id]?.display_name || 'N/A',
      value: contracts.get(c.entity_id)?.totalValue || 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Clients by sales rep — show ALL reps with assignments + "Sem atribuição" bucket
  const repCounts = new Map<string, number>();
  let unassignedCount = 0;
  clients.forEach(c => {
    const rep = (c as any).assigned_to;
    if (rep) repCounts.set(rep, (repCounts.get(rep) || 0) + 1);
    else unassignedCount++;
  });
  const repData = [
    ...Array.from(repCounts.entries())
      .map(([id, count]) => ({ name: assignedUserMap.get(id) || `Comercial ${id.slice(0, 6)}…`, count }))
      .sort((a, b) => b.count - a.count),
    ...(unassignedCount > 0 ? [{ name: 'Sem atribuição', count: unassignedCount }] : []),
  ];

  // At-risk clients sorted by value
  const atRiskClients = clients
    .filter(c => {
      const h = healthScores.get(c.entity_id);
      return h && h.score < 40;
    })
    .map(c => ({
      name: identityMap[c.entity_id]?.display_name || 'N/A',
      value: contracts.get(c.entity_id)?.totalValue || 0,
      score: healthScores.get(c.entity_id)?.score || 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Health distribution */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Distribuição por Saúde</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={healthChartData}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" name="Clientes" radius={[4, 4, 0, 0]}>
                {healthChartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top 10 by value */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Top 10 Clientes por Valor</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {loading && clientValues.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-16 ml-2" />
                </div>
              ))
            ) : (
              <>
                {clientValues.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="truncate flex-1">{i + 1}. {c.name}</span>
                    <span className="font-semibold text-purple-600 ml-2">{formatCurrency(c.value)}</span>
                  </div>
                ))}
                {clientValues.length === 0 && <p className="text-muted-foreground text-sm">Sem dados de contratos</p>}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* By sales rep */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Clientes por Comercial</CardTitle></CardHeader>
        <CardContent>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            <ResponsiveContainer width="100%" height={Math.max(200, repData.length * 28)}>
              <BarChart data={repData} layout="vertical">
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                <Tooltip />
                <Bar dataKey="count" name="Clientes" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* At-risk clients */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Clientes em Risco</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {loading && atRiskClients.length === 0 ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-20 ml-2" />
                </div>
              ))
            ) : (
              <>
                {atRiskClients.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="truncate flex-1">{c.name}</span>
                    <div className="flex items-center gap-2 ml-2">
                      <span className="text-red-600 font-medium">{c.score}</span>
                      <span className="text-purple-600 font-semibold">{formatCurrency(c.value)}</span>
                    </div>
                  </div>
                ))}
                {atRiskClients.length === 0 && <p className="text-muted-foreground text-sm">Nenhum cliente em risco 🎉</p>}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
