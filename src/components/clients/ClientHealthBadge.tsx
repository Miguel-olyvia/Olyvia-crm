import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ClientHealthScore } from "@/hooks/useClientEnrichedData";

interface ClientHealthBadgeProps {
  health: ClientHealthScore;
  size?: "sm" | "md" | "lg";
}

export function ClientHealthBadge({ health, size = "md" }: ClientHealthBadgeProps) {
  // Don't show health badge for inactive/closed clients
  if (health.inactive) return null;

  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-14 h-14 text-lg",
  };

  const borderColor = {
    excellent: "border-green-500",
    good: "border-blue-500",
    attention: "border-yellow-500",
    at_risk: "border-orange-500",
    critical: "border-red-500",
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`${sizeClasses[size]} ${health.bgColor} rounded-full flex items-center justify-center text-white font-bold border-2 ${borderColor[health.level]} cursor-help shadow-sm`}>
            {health.score}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[280px]">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`font-bold ${health.color}`}>{health.label}</span>
              <span className="text-muted-foreground text-xs">({health.score}/100)</span>
            </div>
            <div className="text-xs space-y-1 border-t pt-2">
              <BreakdownRow label="Último contacto" value={health.breakdown.lastContact} />
              <BreakdownRow label="Contratos" value={health.breakdown.contracts} />
              <BreakdownRow label="Engagement email" value={health.breakdown.emailEngagement} />
              <BreakdownRow label="Dados completos" value={health.breakdown.dataCompleteness} />
              <BreakdownRow label="Freq. interação" value={health.breakdown.interactionFrequency} />
              <BreakdownRow label="Sentimento" value={health.breakdown.sentiment} />
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  const color = value > 0 ? "text-green-600" : value < 0 ? "text-red-600" : "text-muted-foreground";
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className={`font-medium ${color}`}>{value > 0 ? `+${value}` : value}</span>
    </div>
  );
}
