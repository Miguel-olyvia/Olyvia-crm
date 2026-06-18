import { differenceInDays, formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface ContactSummaryBarProps {
  convertedAt: string | null;
  lastInteractionAt: string | null;
  interactionCount: number;
  pipelineValue: number;
  nextAction: { description: string; date: string } | null;
}

export function ContactSummaryBar({
  convertedAt, lastInteractionAt, interactionCount, pipelineValue, nextAction,
}: ContactSummaryBarProps) {
  const lastContactDays = lastInteractionAt ? differenceInDays(new Date(), new Date(lastInteractionAt)) : null;
  const lastContactColor = lastContactDays === null ? "text-muted-foreground" :
    lastContactDays <= 3 ? "text-green-600" :
    lastContactDays <= 7 ? "text-yellow-600" : "text-red-600";

  const lastContactText = lastInteractionAt
    ? `há ${formatDistanceToNow(new Date(lastInteractionAt), { locale: pt })}`
    : "Sem contacto";

  return (
    <div className="grid grid-cols-5 gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-center text-xs">
      <div>
        <p className="text-muted-foreground uppercase tracking-wider text-[10px] font-medium">Convertido de Lead</p>
        <p className="font-semibold mt-0.5">
          {convertedAt ? new Date(convertedAt).toLocaleDateString("pt-PT") : "—"}
        </p>
      </div>
      <div>
        <p className="text-muted-foreground uppercase tracking-wider text-[10px] font-medium">Último Contacto</p>
        <p className={`font-semibold mt-0.5 ${lastContactColor}`}>{lastContactText}</p>
      </div>
      <div>
        <p className="text-muted-foreground uppercase tracking-wider text-[10px] font-medium">Interacções</p>
        <p className="font-semibold mt-0.5">{interactionCount}</p>
      </div>
      <div>
        <p className="text-muted-foreground uppercase tracking-wider text-[10px] font-medium">Valor Pipeline</p>
        <p className="font-semibold mt-0.5">{formatCurrency(pipelineValue)}</p>
      </div>
      <div>
        <p className="text-muted-foreground uppercase tracking-wider text-[10px] font-medium">Próxima Acção</p>
        {nextAction ? (
          <p className="font-semibold mt-0.5 text-foreground truncate">{nextAction.description}</p>
        ) : (
          <p className="font-semibold mt-0.5 text-destructive flex items-center justify-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Nenhuma
          </p>
        )}
      </div>
    </div>
  );
}
