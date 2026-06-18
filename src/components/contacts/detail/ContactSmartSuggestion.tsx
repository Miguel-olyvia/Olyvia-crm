import { differenceInDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Phone, Briefcase, Calendar, Lightbulb } from "lucide-react";

interface ContactSmartSuggestionProps {
  lastInteractionAt: string | null;
  hasActiveDeal: boolean;
  hasNextAction: boolean;
  dealCount: number;
  proposalCount: number;
  contactName: string;
  onCall: () => void;
  onCreateDeal: () => void;
}

export function ContactSmartSuggestion({
  lastInteractionAt, hasActiveDeal, hasNextAction, dealCount, proposalCount, contactName, onCall, onCreateDeal,
}: ContactSmartSuggestionProps) {
  const daysSince = lastInteractionAt ? differenceInDays(new Date(), new Date(lastInteractionAt)) : 999;

  let suggestion = "";
  let actionLabel = "";
  let ActionIcon = Lightbulb;
  let onAction: (() => void) | null = null;

  if (daysSince > 7) {
    suggestion = `${contactName.split(" ")[0]} tem ${dealCount > 0 ? `${dealCount} negócio${dealCount > 1 ? "s" : ""} e ${proposalCount} proposta${proposalCount !== 1 ? "s" : ""}` : "registos"} mas sem acção agendada. O último contacto foi há ${daysSince} dias — sugerimos ligar para dar seguimento${proposalCount > 0 ? " à proposta" : ""}.`;
    actionLabel = "Ligar";
    ActionIcon = Phone;
    onAction = onCall;
  } else if (!hasActiveDeal) {
    suggestion = `${contactName.split(" ")[0]} não tem pedido de proposta associado. Criar um pedido para acompanhar a oportunidade.`;
    actionLabel = "Novo Pedido";
    ActionIcon = Briefcase;
    onAction = onCreateDeal;
  } else if (!hasNextAction) {
    suggestion = `Sem acção planeada para ${contactName.split(" ")[0]}. Agende um follow-up para manter o contacto activo.`;
    actionLabel = "Agendar";
    ActionIcon = Calendar;
    onAction = null;
  } else {
    return null; // No suggestion needed
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
