import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { calculateHealthScore } from "@/hooks/useContactHealthScore";
import { TrendingUp, Users, Handshake, Heart, AlertTriangle, DollarSign, Target } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface DashboardContact {
  id: string;
  entity_id: string;
  status: string;
  assigned_to: string | null;
  last_interaction_at: string | null;
  created_at: string;
}

interface ContactsFullDashboardProps {
  contacts: DashboardContact[];
  interactionCounts: Record<string, number>;
  lastInteractions: Record<string, string>;
  dealsData: Record<string, { count: number; value: number }>;
  proposalsData?: Record<string, { count: number; value: number }>;
  quotesData?: Record<string, { count: number; value: number }>;
  assignedUserMap: Map<string, string>;
  getIdentity: (entityId: string) => { display_name?: string; email?: string; phone?: string; vat?: string } | undefined;
}

const HEALTH_COLORS: Record<string, string> = {
  excellent: "hsl(var(--success))",
  good: "hsl(199, 89%, 52%)",
  attention: "hsl(var(--warning))",
  at_risk: "hsl(25, 95%, 53%)",
  critical: "hsl(var(--destructive))",
};

const HEALTH_LABELS: Record<string, string> = {
  excellent: "Excelente",
  good: "Bom",
  attention: "Atenção",
  at_risk: "Em Risco",
  critical: "Crítico",
};

export function ContactsFullDashboard({
  contacts, interactionCounts, lastInteractions, dealsData, proposalsData = {}, quotesData = {}, assignedUserMap, getIdentity
}: ContactsFullDashboardProps) {

  const analytics = useMemo(() => {
    const healthDistribution: Record<string, number> = { excellent: 0, good: 0, attention: 0, at_risk: 0, critical: 0 };
    let totalScore = 0;
    let totalPipeline = 0;
    let withDeals = 0;
    let withoutContact7d = 0;
    const byCommercial: Record<string, number> = {};

    // Monthly trend (last 6 months)
    const monthlyData: Record<string, number> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyData[key] = 0;
    }

    contacts.forEach(c => {
      const identity = getIdentity(c.entity_id);
      const hs = calculateHealthScore({
        lastInteractionAt: lastInteractions[c.entity_id] || c.last_interaction_at,
        hasActiveDeal: !!dealsData[c.entity_id]?.count,
        hasEmail: !!identity?.email,
        hasPhone: !!identity?.phone,
        hasVat: !!identity?.vat,
        interactionCount30d: interactionCounts[c.entity_id] || 0,
      });
      healthDistribution[hs.level]++;
      totalScore += hs.score;

      const hasDeal = !!dealsData[c.entity_id]?.count;
      const hasProposal = !!proposalsData[c.entity_id]?.count;
      const hasQuote = !!quotesData[c.entity_id]?.count;
      if (hasDeal || hasProposal || hasQuote) {
        withDeals++;
      }
      // Melhor estágio por contacto (Proposta > Orçamento > PP) para evitar dupla contagem
      if (hasProposal) totalPipeline += proposalsData[c.entity_id].value;
      else if (hasQuote) totalPipeline += quotesData[c.entity_id].value;
      else if (hasDeal) totalPipeline += dealsData[c.entity_id].value;


      const lastDate = lastInteractions[c.entity_id] || c.last_interaction_at;
      if (!lastDate || (new Date().getTime() - new Date(lastDate).getTime()) / 86400000 > 7) {
        withoutContact7d++;
      }

      if (c.assigned_to) {
        const name = assignedUserMap.get(c.assigned_to) || "Sem nome";
        byCommercial[name] = (byCommercial[name] || 0) + 1;
      }

      // Monthly trend
      const createdMonth = c.created_at.substring(0, 7);
      if (monthlyData[createdMonth] !== undefined) {
        monthlyData[createdMonth]++;
      }
    });

    const avgHealth = contacts.length > 0 ? Math.round(totalScore / contacts.length) : 0;

    return {
      healthDistribution,
      avgHealth,
      totalPipeline,
      withDeals,
      withoutDeals: contacts.length - withDeals,
      withoutContact7d,
      byCommercial,
      monthlyData,
    };
  }, [contacts, interactionCounts, lastInteractions, dealsData, assignedUserMap, getIdentity]);

  const healthChartData = Object.entries(analytics.healthDistribution).map(([level, count]) => ({
    name: HEALTH_LABELS[level], value: count, fill: HEALTH_COLORS[level],
  }));

  const commercialData = Object.entries(analytics.byCommercial)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name: name.split(" ")[0], count }));

  const trendData = Object.entries(analytics.monthlyData).map(([month, count]) => ({
    month: month.substring(5), count,
  }));

  const KPI = ({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string | number; sub?: string; color?: string }) => (
    <Card className="border">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${color || "bg-primary/10"}`}>
            <Icon className={`h-5 w-5 ${color ? "text-white" : "text-primary"}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-xl font-bold text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI icon={Users} label="Total" value={contacts.length} />
        <KPI icon={DollarSign} label="Pipeline" value={formatCurrency(analytics.totalPipeline)} sub={`${analytics.withDeals} em pipeline`} />
        <KPI icon={Target} label="Receita Pot." value={formatCurrency(analytics.totalPipeline * 0.65)} sub="65% probabilidade" />
        <KPI icon={Handshake} label="Sem Deal" value={analytics.withoutDeals} color={analytics.withoutDeals > 0 ? "bg-warning" : undefined} />
        <KPI icon={AlertTriangle} label="Sem Contacto >7d" value={analytics.withoutContact7d} color={analytics.withoutContact7d > 0 ? "bg-destructive" : undefined} />
        <KPI icon={Heart} label="Saúde Média" value={`${analytics.avgHealth}/100`} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Health Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Distribuição de Saúde</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={healthChartData} layout="vertical" margin={{ left: 60 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={60} />
                <Tooltip />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {healthChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Monthly trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Evolução Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* By commercial */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Por Comercial</CardTitle>
          </CardHeader>
          <CardContent>
            {commercialData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={commercialData}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Funnel */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Pipeline Resumo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 overflow-x-auto">
            {[
              { label: "Contactos", value: contacts.length, color: "bg-primary" },
              { label: "Com Deal", value: analytics.withDeals, color: "bg-info" },
              { label: "Pipeline", value: formatCurrency(analytics.totalPipeline), color: "bg-success" },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                {i > 0 && <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />}
                <div className="flex items-center gap-2 rounded-lg border px-4 py-3 min-w-[120px]">
                  <div className={`h-3 w-3 rounded-full ${step.color}`} />
                  <div>
                    <p className="text-xs text-muted-foreground">{step.label}</p>
                    <p className="text-lg font-bold">{step.value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
