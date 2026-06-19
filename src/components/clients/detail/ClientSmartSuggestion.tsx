import { useState } from "react";
import { differenceInDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Phone, Briefcase, Calendar, Lightbulb, FileText, Mail } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface ClientSmartSuggestionProps {
  lastInteractionAt: string | null;
  hasActiveDeal: boolean;
  hasNextAction: boolean;
  dealCount: number;
  contractCount: number;
  totalValue: number;
  clientName: string;
  expiringContract: { name: string; daysUntil: number } | null;
  onCall: () => void;
  onCreateDeal: () => void;
  onEmail: () => void;
  onSchedule?: () => void;
}

export function ClientSmartSuggestion({
  lastInteractionAt, hasActiveDeal, hasNextAction, dealCount, contractCount, totalValue,
  clientName, expiringContract, onCall, onCreateDeal, onEmail, onSchedule,
}: ClientSmartSuggestionProps) {
  const [dismissed, setDismissed] = useState(false);
  const daysSince = lastInteractionAt ? differenceInDays(new Date(), new Date(lastInteractionAt)) : 999;
  const firstName = clientName.split(" ")[0];

  if (dismissed) return null;

  let suggestion = "";
  let actionLabel = "";
  let ActionIcon = Lightbulb;
  let onAction: (() => void) | null = null;
  let secondaryLabel = "";
  let secondaryIcon = Lightbulb;
  let onSecondary: (() => void) | null = null;

  if (expiringContract) {
    suggestion = `O ${firstName} é cliente VIP com ${contractCount} contrato${contractCount !== 1 ? "s" : ""} activo${contractCount !== 1 ? "s" : ""} e valor total de ${formatCurrency(totalValue)}. O contrato "${expiringContract.name}" renova em ${expiringContract.daysUntil} dias — sugerimos preparar proposta de renovação.`;
    actionLabel = "Preparar proposta";
    ActionIcon = FileText;
    onAction = onCreateDeal;
    secondaryLabel = "Ligar";
    secondaryIcon = Phone;
    onSecondary = onCall;
  } else if (daysSince > 7) {
    suggestion = `${firstName} tem ${contractCount > 0 ? `${contractCount} contrato${contractCount !== 1 ? "s" : ""}` : "registos"} mas sem contacto há ${daysSince} dias. Sugerimos ligar para dar seguimento.`;
    actionLabel = "Ligar";
    ActionIcon = Phone;
    onAction = onCall;
    secondaryLabel = "Enviar email";
    secondaryIcon = Mail;
    onSecondary = onEmail;
  } else if (!hasActiveDeal && contractCount > 0) {
    suggestion = `${firstName} é cliente activo sem pedido de proposta em aberto. Boa oportunidade para criar um novo pedido.`;
    actionLabel = "Novo Pedido";
    ActionIcon = Briefcase;
    onAction = onCreateDeal;
  } else if (!hasNextAction) {
    suggestion = `Sem acção planeada para ${firstName}. Agende um follow-up para manter o contacto activo.`;
    actionLabel = "Agendar";
    ActionIcon = Calendar;
    onAction = onSchedule || onCall;
  } else {
    return null;
  }

  return (
    <div className="rounded-lg bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-purple-500/10 border border-purple-200 dark:border-purple-800 px-4 py-3">
      <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
        <Lightbulb className="h-3.5 w-3.5" /> Sugestão Inteligente
      </p>
      <p className="text-sm text-foreground mb-2.5">{suggestion}</p>
      <div className="flex items-center gap-2">
        {onAction && (
          <Button size="sm" onClick={onAction} className="gap-1 bg-primary hover:bg-primary/90">
            <ActionIcon className="h-3.5 w-3.5" />
            {actionLabel}
          </Button>
        )}
        {onSecondary && (
          <Button size="sm" variant="outline" onClick={onSecondary} className="gap-1">
            {secondaryLabel}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => setDismissed(true)}>
          Ignorar
        </Button>
      </div>
    </div>
  );
}
