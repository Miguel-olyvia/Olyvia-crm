import { type HealthScore } from "@/hooks/useContactHealthScore";
import { Progress } from "@/components/ui/progress";
import { Lightbulb } from "lucide-react";

interface ContactScoringTabProps {
  healthScore: HealthScore;
  daysSinceContact: number | null;
  hasActiveDeal: boolean;
  interactionCount: number;
  hasEmail: boolean;
  hasPhone: boolean;
  hasVat: boolean;
  lastSentiment: string | null;
  hasNextAction: boolean;
}

const FACTOR_ICONS: Record<string, string> = {
  lastContact: "👁",
  dealActivity: "📋",
  engagement: "📧",
  responseSpeed: "⚡",
  dataCompleteness: "📄",
  sentiment: "😊",
  nextAction: "📅",
};

export function ContactScoringTab({
  healthScore, daysSinceContact, hasActiveDeal, interactionCount,
  hasEmail, hasPhone, hasVat, lastSentiment, hasNextAction,
}: ContactScoringTabProps) {
  // Extended scoring breakdown
  const factors = [
    {
      key: "lastContact",
      label: `Último contacto (${daysSinceContact !== null ? `${daysSinceContact} dias` : "sem dados"})`,
      value: healthScore.breakdown.lastContact,
      max: 25,
      color: healthScore.breakdown.lastContact >= 15 ? "bg-green-500" : healthScore.breakdown.lastContact >= 10 ? "bg-yellow-500" : "bg-red-500",
    },
    {
      key: "dealActivity",
      label: hasActiveDeal ? "Tem deal activo" : "Sem deal activo",
      value: healthScore.breakdown.dealActivity,
      max: 15,
      color: healthScore.breakdown.dealActivity >= 12 ? "bg-green-500" : healthScore.breakdown.dealActivity > 0 ? "bg-yellow-500" : "bg-red-500",
    },
    {
      key: "engagement",
      label: `Engagement (${interactionCount} interacções)`,
      value: healthScore.breakdown.interactionFrequency,
      max: 10,
      color: healthScore.breakdown.interactionFrequency >= 7 ? "bg-green-500" : healthScore.breakdown.interactionFrequency >= 4 ? "bg-blue-500" : "bg-yellow-500",
    },
    {
      key: "dataCompleteness",
      label: `Dados completos (${[!hasEmail && "falta email", !hasPhone && "falta telefone", !hasVat && "falta NIF"].filter(Boolean).join(", ") || "completo"})`,
      value: healthScore.breakdown.dataCompleteness,
      max: 10,
      color: healthScore.breakdown.dataCompleteness >= 8 ? "bg-green-500" : healthScore.breakdown.dataCompleteness >= 4 ? "bg-yellow-500" : "bg-red-500",
    },
    {
      key: "sentiment",
      label: lastSentiment ? `Sentimento ${lastSentiment === "positive" ? "positivo" : lastSentiment === "neutral" ? "neutro" : "negativo"}` : "Sem sentimento registado",
      value: lastSentiment === "positive" ? 10 : lastSentiment === "neutral" ? 5 : 0,
      max: 10,
      color: lastSentiment === "positive" ? "bg-green-500" : lastSentiment === "neutral" ? "bg-yellow-500" : "bg-muted",
    },
    {
      key: "nextAction",
      label: hasNextAction ? "Tem acção agendada" : "Nenhuma acção agendada",
      value: hasNextAction ? 6 : 0,
      max: 6,
      color: hasNextAction ? "bg-green-500" : "bg-red-500",
    },
  ];

  // Calculate improvement tips
  const tips: string[] = [];
  let potentialGain = 0;
  if (!hasNextAction) { tips.push("agendar próxima acção (+6)"); potentialGain += 6; }
  if (healthScore.breakdown.dataCompleteness < 10) { 
    const missing = 10 - healthScore.breakdown.dataCompleteness;
    tips.push(`completar dados (+${missing})`); 
    potentialGain += missing; 
  }
  if (healthScore.breakdown.lastContact < 20) {
    tips.push("contactar novamente (+5-10)");
    potentialGain += 5;
  }

  const targetScore = Math.min(100, healthScore.score + Math.round((potentialGain / 60) * 100));

  return (
    <div className="space-y-6 mt-4">
      {/* Big score */}
      <div className="text-center space-y-1">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">📈 Health Score</h3>
        <p className="text-4xl font-bold">{healthScore.score}<span className="text-lg text-muted-foreground">/100</span></p>
        <p className={`text-sm font-medium ${healthScore.color}`}>{healthScore.label}</p>
      </div>

      {/* Factor bars */}
      <div className="space-y-3">
        {factors.map(f => (
          <div key={f.key} className="flex items-center gap-3">
            <span className="text-base shrink-0">{FACTOR_ICONS[f.key]}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <p className="text-sm truncate">{f.label}</p>
                <span className={`text-sm font-bold ${f.value >= f.max * 0.7 ? "text-green-600" : f.value > 0 ? "text-yellow-600" : "text-red-500"}`}>
                  {f.value}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${f.color}`} style={{ width: `${(f.value / f.max) * 100}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Improvement tip */}
      {tips.length > 0 && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 flex items-start gap-2">
          <Lightbulb className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Para subir para {targetScore}: {tips.join(" e ")}
          </p>
        </div>
      )}
    </div>
  );
}
