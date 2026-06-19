import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { X } from "lucide-react";
import { type LeadHealthScore } from "@/hooks/useLeadHealthScore";

interface LeadDetailHeaderProps {
  leadName: string;
  status: string;
  source: string | null;
  tags: string[] | null;
  healthScore: LeadHealthScore;
  campaignName: string | null;
  getStatusLabel: (status: string) => string;
  getStatusColor: (status: string) => string;
  onClose: () => void;
}

const HEALTH_COLORS: Record<string, string> = {
  excellent: "bg-green-500",
  good: "bg-blue-500",
  attention: "bg-yellow-500",
  at_risk: "bg-orange-500",
  critical: "bg-red-500",
};

export function LeadDetailHeader({
  leadName, status, source, tags, healthScore, campaignName,
  getStatusLabel, getStatusColor, onClose,
}: LeadDetailHeaderProps) {
  const initials = leadName
    .split(" ")
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  return (
    <div className="flex items-start gap-4 pb-4">
      {/* Avatar */}
      <div className="h-14 w-14 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-lg font-bold shrink-0">
        {initials}
      </div>

      {/* Name & badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl font-bold truncate">{leadName || "—"}</h2>
        </div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <Badge variant="outline" className={getStatusColor(status)}>
            {getStatusLabel(status)}
          </Badge>
          <Badge variant="secondary" className="text-xs">Lead</Badge>
          {source && (
            <Badge variant="outline" className="text-xs border-primary text-primary font-semibold">
              {source.toUpperCase()}
            </Badge>
          )}
          {campaignName && (
            <Badge variant="outline" className="text-xs">
              {campaignName}
            </Badge>
          )}
          {tags?.map((tag, i) => (
            <Badge key={i} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      {/* Health score circle */}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 shrink-0 cursor-help">
              <div className={`h-12 w-12 rounded-full flex items-center justify-center text-white text-sm font-bold ${HEALTH_COLORS[healthScore.level]}`}>
                {healthScore.score}
              </div>
              <div className="text-xs">
                <p className="font-semibold">{healthScore.label}</p>
                <p className="text-muted-foreground">{healthScore.score}/100</p>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs p-3 text-xs space-y-1">
            <p className="font-semibold mb-1">📊 Breakdown do Score</p>
            <div className="space-y-0.5">
              <p>📞 Resultado contacto: <strong>{healthScore.breakdown.contactResult}/35</strong></p>
              <p>📅 Dias sem contacto: <strong>{healthScore.breakdown.daysSinceContact}/25</strong></p>
              <p>🔄 Fase no funil: <strong>{healthScore.breakdown.funnelStage}/20</strong></p>
              <p>🎯 Tentativas vs resultado: <strong>{healthScore.breakdown.attemptsVsResult}/20</strong></p>
            </div>
            <hr className="my-1.5 border-border" />
            <p className="text-muted-foreground">Score: {healthScore.score}/100</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Close button */}
      <Button size="icon" variant="ghost" onClick={onClose} className="shrink-0">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
