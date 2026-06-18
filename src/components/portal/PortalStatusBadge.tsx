import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface PortalStatusBadgeProps {
  status: string | null | undefined;
}

export function PortalStatusBadge({ status }: PortalStatusBadgeProps) {
  if (!status) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const config: Record<string, { emoji: string; label: string; variant: "outline" | "default" | "secondary" | "destructive" }> = {
    sent: { emoji: "📧", label: "Enviado", variant: "outline" },
    viewed: { emoji: "👁", label: "Acedido", variant: "secondary" },
    signed: { emoji: "✅", label: "Assinado", variant: "default" },
  };

  const c = config[status] || { emoji: "❓", label: status, variant: "outline" as const };

  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge variant={c.variant} className="text-[10px] gap-1 cursor-default">
          {c.emoji} {c.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>Estado do portal: {c.label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
