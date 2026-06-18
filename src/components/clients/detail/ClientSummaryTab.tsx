import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Calendar, Check, HelpCircle, Star } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { pt } from "date-fns/locale";
import { type HealthScore } from "@/hooks/useContactHealthScore";

interface Deal {
  id: string; title: string; value: number; stage_id: string;
  probability?: number; created_at?: string; assigned_to?: string;
  stages: { name: string; color: string } | null;
}

interface Contract {
  id: string; title: string; status: string; total_value: number;
  start_date: string | null; end_date: string | null; payment_terms?: string | null;
}

interface ClientSummaryTabProps {
  client: any;
  deals: Deal[];
  contracts: Contract[];
  interactions: any[];
  healthScore: HealthScore;
  nextAction: { id?: string; description: string; date: string } | null;
  sourceLead: any | null;
  userMap: Record<string, string>;
  onCreateDeal: () => void;
  onScheduleAction?: () => void;
  onEditAction?: () => void;
}

const HEALTH_FACTOR_CONFIG = [
  { key: "lastContact", icon: "👁", label: "Último contacto", max: 25 },
  { key: "dealActivity", icon: "📋", label: "Deals activos", max: 15 },
  { key: "engagement", icon: "📧", label: "Engagement (emails)", max: 12 },
  { key: "responseSpeed", icon: "⚡", label: "Velocidade resposta", max: 15 },
  { key: "dataCompleteness", icon: "📄", label: "Dados completos", max: 10 },
  { key: "interactionFrequency", icon: "📊", label: "Frequência de interacção", max: 10 },
  { key: "sentiment", icon: "😊", label: "Sentimento", max: 10 },
];

export function ClientSummaryTab({
  client, deals, contracts, interactions, healthScore, nextAction, sourceLead, userMap, onCreateDeal, onScheduleAction, onEditAction,
}: ClientSummaryTabProps) {
  const activeContracts = contracts.filter(c => c.status === "active" || c.status === "signed");
  const now = new Date();

  const factorValues: Record<string, number> = {
    lastContact: healthScore.breakdown.lastContact,
    dealActivity: healthScore.breakdown.dealActivity,
    engagement: Math.min(12, Math.round(healthScore.breakdown.interactionFrequency * 1.2)),
    responseSpeed: Math.min(15, healthScore.breakdown.lastContact <= 20 ? 15 : 5),
    dataCompleteness: healthScore.breakdown.dataCompleteness,
    interactionFrequency: healthScore.breakdown.interactionFrequency,
    sentiment: 10,
  };

  const steps = [
    { label: "Lead Criada", date: sourceLead?.created_at || null, completed: !!sourceLead },
    { label: "Contactado", date: client.converted_at || client.created_at, completed: true },
    { label: "→ Contacto", date: client.created_at, completed: true },
    { label: "→ Cliente", date: client.client_since || client.created_at, completed: true, current: true },
  ];

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Contracts card */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <Label className="text-muted-foreground flex items-center gap-2 text-xs uppercase tracking-wider">
              📑 Contratos Activos
            </Label>
            {activeContracts.length > 0 ? activeContracts.map(c => {
              const daysToEnd = c.end_date ? differenceInDays(new Date(c.end_date), now) : null;
              return (
                <div key={c.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{c.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {c.start_date && `Início: ${format(new Date(c.start_date), "dd/MM/yyyy", { locale: pt })}`}
                        {c.end_date && ` · Fim: ${format(new Date(c.end_date), "dd/MM/yyyy", { locale: pt })}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-600">€{c.total_value?.toLocaleString("pt-PT")}</p>
                    {daysToEnd !== null && daysToEnd > 0 && daysToEnd <= 60 && (
                      <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30">
                        Renova em {daysToEnd}d
                      </Badge>
                    )}
                    {(!daysToEnd || daysToEnd > 60) && (
                      <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30">
                        {c.payment_terms === "recurring" ? "Recorrente" : "Activo"}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            }) : (
              <p className="text-sm text-muted-foreground text-center py-4">Sem contratos activos</p>
            )}
          </CardContent>
        </Card>

        {/* Deals card */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <Label className="text-muted-foreground flex items-center gap-2 text-xs uppercase tracking-wider">
              📋 Pedidos de Proposta
            </Label>
            {deals.length > 0 ? deals.slice(0, 3).map(deal => (
              <div key={deal.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-2">
                  {deal.stages && (
                    <Badge className="text-[10px]" style={{ backgroundColor: deal.stages.color, color: "white" }}>
                      {deal.stages.name}
                    </Badge>
                  )}
                  <div>
                    <p className="text-sm font-medium">{deal.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {deal.created_at && `Criado ${format(new Date(deal.created_at), "dd/MM", { locale: pt })}`}
                      {deal.assigned_to && userMap[deal.assigned_to] && ` · ${userMap[deal.assigned_to]}`}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-green-600">€{deal.value?.toLocaleString("pt-PT")}</p>
                  {deal.probability && (
                    <span className="text-[10px] text-amber-600">{deal.probability}%</span>
                  )}
                </div>
              </div>
            )) : null}
            <button onClick={onCreateDeal} className="w-full text-center text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-md py-2">
              + Novo Pedido de Proposta
            </button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Next Actions card */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <Label className="text-muted-foreground flex items-center gap-2 text-xs uppercase tracking-wider">
              📅 Próximas Acções
            </Label>
            {nextAction ? (
              <div
                className="flex items-center justify-between py-2 rounded-md bg-amber-50 dark:bg-amber-900/10 px-3 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors"
                onClick={onEditAction}
                title="Clique para editar"
              >
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-amber-600" />
                  <p className="text-sm font-medium">{nextAction.description}</p>
                </div>
                <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30">
                  {format(new Date(nextAction.date), "dd/MM HH'h'mm", { locale: pt })}
                </Badge>
              </div>
            ) : (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                <span className="text-sm text-destructive">Sem acção planeada</span>
                <button
                  onClick={onScheduleAction}
                  className="text-sm text-primary cursor-pointer hover:underline ml-1"
                >
                  — Agendar agora
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Health Score Breakdown card */}
        <Card>
          <CardContent className="pt-4 space-y-2">
            <Label className="text-muted-foreground flex items-center gap-2 text-xs uppercase tracking-wider">
              📈 Health Score — {healthScore.score}/100
            </Label>
            {HEALTH_FACTOR_CONFIG.map(f => {
              const value = factorValues[f.key] || 0;
              const pct = Math.round((value / f.max) * 100);
              return (
                <div key={f.key} className="flex items-center gap-2">
                  <span className="text-sm shrink-0 w-4">{f.icon}</span>
                  <span className="text-xs flex-1 truncate">{f.label}</span>
                  <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className={`text-xs font-bold w-5 text-right ${pct >= 70 ? "text-green-600" : pct >= 40 ? "text-yellow-600" : "text-red-500"}`}>
                    {value}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Journey */}
      <Card>
        <CardContent className="pt-4">
          <Label className="text-muted-foreground flex items-center gap-2 text-xs uppercase tracking-wider mb-3">
            🗺 Percurso Completo
          </Label>
          <div className="flex items-center justify-between px-4">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center border-2 ${
                    step.current ? "bg-purple-500 border-purple-500 text-white" :
                    step.completed ? "bg-green-500 border-green-500 text-white" :
                    "bg-muted border-muted-foreground/30 text-muted-foreground"
                  }`}>
                    {step.current ? <Star className="h-4 w-4" /> :
                     step.completed ? <Check className="h-4 w-4" /> :
                     <HelpCircle className="h-4 w-4" />}
                  </div>
                  <p className={`text-[10px] mt-1 font-medium ${step.current ? "text-purple-600 dark:text-purple-400" : "text-foreground"}`}>
                    {step.label}
                  </p>
                  <p className="text-[9px] text-muted-foreground">
                    {step.date ? format(new Date(step.date), "dd/MM/yyyy", { locale: pt }) : "—"}
                  </p>
                </div>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 ${steps[i + 1].completed ? "bg-green-500" : "bg-muted-foreground/20"}`} />
                )}
              </div>
            ))}
          </div>
          {sourceLead && (
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground border-t pt-2">
              {sourceLead.source_type && <span>🚀 Origem: <strong className="text-foreground">{sourceLead.source_type}</strong></span>}
              {sourceLead.campaign && <span>📣 Campanha: <strong className="text-foreground">{sourceLead.campaign}</strong></span>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
