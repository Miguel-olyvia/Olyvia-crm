import { differenceInDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Phone, Briefcase, Calendar, Lightbulb } from "lucide-react";

interface LeadSmartSuggestionProps {
  lastInteractionAt: string | null;
  hasActiveDeal: boolean;
  hasNextAction: boolean;
  status: string;
  leadName: string;
  onCall: () => void;
  onCreateDeal: () => void;
}

export function LeadSmartSuggestion({
  lastInteractionAt, hasActiveDeal, hasNextAction, status, leadName, onCall, onCreateDeal,
}: LeadSmartSuggestionProps) {
  const daysSince = lastInteractionAt ? differenceInDays(new Date(), new Date(lastInteractionAt)) : 999;
  const firstName = leadName.split(" ")[0] || "Lead";

  let suggestion = "";
  let actionLabel = "";
  let ActionIcon = Lightbulb;
  let onAction: (() => void) | null = null;

  if (!hasNextAction && daysSince > 5) {
    suggestion = `${firstName} sem contacto há ${daysSince} dias e sem acção planeada. Sugerimos contactar para dar seguimento.`;
    actionLabel = "Ligar";
    ActionIcon = Phone;
    onAction = onCall;
  } else if (!hasNextAction) {
    suggestion = `Sem acção planeada para ${firstName}. Agende um follow-up para manter o contacto activo.`;
    actionLabel = "Agendar";
    ActionIcon = Calendar;
    onAction = onCall;
  } else if (status === "qualified" && !hasActiveDeal) {
    suggestion = `${firstName} está qualificada mas sem pedido de proposta associado. Criar um pedido para acompanhar a oportunidade.`;
    actionLabel = "Novo Pedido";
    ActionIcon = Briefcase;
    onAction = onCreateDeal;
  } else if (daysSince > 7) {
    suggestion = `Último contacto com ${firstName} há ${daysSince} dias. Recomendamos contactar brevemente.`;
    actionLabel = "Ligar";
    ActionIcon = Phone;
    onAction = onCall;
  } else {
    return null;
  }

  return (
    <div className="rounded-lg bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-purple-500/10 border border-purple-200 dark:border-purple-800 px-4 py-3 flex items-center gap-3">
      <div className="h-8 w-8 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
        <Lightbulb className="h-4 w-4 text-purple-600 dark:text-purple-400" />
      </div>
      <p className="text-sm flex-1 text-foreground">{suggestion}</p>
      <div className="flex items-center gap-2 shrink-0">
        {onAction && (
          <Button size="sm" onClick={onAction} className="gap-1 bg-primary hover:bg-primary/90">
            <ActionIcon className="h-3.5 w-3.5" />
            {actionLabel}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="text-xs text-muted-foreground">
          Ignorar
        </Button>
      </div>
    </div>
  );
}
