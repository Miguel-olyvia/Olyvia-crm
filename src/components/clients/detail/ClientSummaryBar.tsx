import { differenceInDays, formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { AlertTriangle, Calendar } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface ClientSummaryBarProps {
  clientSince: string | null;
  lastInteractionAt: string | null;
  interactionCount: number;
  totalValue: number;
  activeContracts: number;
  nextAction: { description: string; date: string } | null;
}

export function ClientSummaryBar({
  clientSince, lastInteractionAt, interactionCount, totalValue, activeContracts, nextAction,
}: ClientSummaryBarProps) {
  const lastContactDays = lastInteractionAt ? differenceInDays(new Date(), new Date(lastInteractionAt)) : null;
  const lastContactColor = lastContactDays === null ? "text-muted-foreground" :
    lastContactDays <= 7 ? "text-green-600" :
    lastContactDays <= 30 ? "text-yellow-600" : "text-red-600";

  const lastContactText = lastInteractionAt
    ? (lastContactDays === 0 ? "Hoje" : `há ${formatDistanceToNow(new Date(lastInteractionAt), { locale: pt })}`)
    : "Nunca";

  return (
    <div className="grid grid-cols-6 gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-center text-xs">
      <div>
        <p className="text-muted-foreground uppercase tracking-wider text-[10px] font-medium">Cliente Desde</p>
        <p className="font-semibold mt-0.5">
          {clientSince ? new Date(clientSince).toLocaleDateString("pt-PT") : "—"}
        </p>
      </div>
      <div>
        <p className="text-muted-foreground uppercase tracking-wider text-[10px] font-medium">Último Contacto</p>
        <p className={`font-semibold mt-0.5 ${lastContactColor}`}>{lastContactText}</p>
      </div>
      <div>
        <p className="text-muted-foreground uppercase tracking-wider text-[10px] font-medium">Total Interacções</p>
        <p className="font-semibold mt-0.5">{interactionCount}</p>
      </div>
      <div>
        <p className="text-muted-foreground uppercase tracking-wider text-[10px] font-medium">Valor Total</p>
        <p className="font-semibold mt-0.5">{formatCurrency(totalValue)}</p>
      </div>
      <div>
        <p className="text-muted-foreground uppercase tracking-wider text-[10px] font-medium">Contratos Activos</p>
        <p className="font-semibold mt-0.5">{activeContracts}</p>
      </div>
      <div>
        <p className="text-muted-foreground uppercase tracking-wider text-[10px] font-medium">Próxima Acção</p>
        {nextAction ? (
          <p className="font-semibold mt-0.5 text-foreground truncate flex items-center justify-center gap-1">
            <Calendar className="h-3 w-3" /> {nextAction.description}
          </p>
        ) : (
          <p className="font-semibold mt-0.5 text-destructive flex items-center justify-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Nenhuma
          </p>
        )}
      </div>
    </div>
  );
}
