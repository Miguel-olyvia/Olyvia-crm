import { useState } from "react";
import { CheckCircle2, Clock, AlertTriangle, Lightbulb, Bell, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { differenceInDays, parseISO, isPast } from "date-fns";
import { cn } from "@/lib/utils";

interface Proposal {
  id: string;
  title: string;
  value: number;
  status: string;
  stage_name?: string;
  valid_until: string | null;
  created_at: string;
  sent_at?: string | null;
  updated_at?: string;
  contract_id?: string | null;
}

interface ProposalsAlertBarsProps {
  proposals: Proposal[];
  onNavigateContracts?: () => void;
  onSendFollowUp?: (ids: string[]) => void;
  onRenewValidity?: (proposalId: string) => void;
  onOpenProposal?: (proposalId: string) => void;
  noResponseDays?: number;
  noResponseUrgentDays?: number;
  noResponseEnabled?: boolean;
  noResponseUrgentEnabled?: boolean;
  expiredEnabled?: boolean;
  noValidityEnabled?: boolean;
  draftStaleEnabled?: boolean;
  draftStaleDays?: number;
}

export function ProposalsAlertBars({
  proposals,
  onNavigateContracts,
  onSendFollowUp,
  onRenewValidity,
  onOpenProposal,
  noResponseDays = 5,
  noResponseUrgentDays = 10,
  noResponseEnabled = true,
  noResponseUrgentEnabled = true,
  expiredEnabled = true,
  noValidityEnabled = true,
  draftStaleEnabled = true,
  draftStaleDays = 5,
}: ProposalsAlertBarsProps) {
  const [open, setOpen] = useState(false);
  const now = new Date();

  const acceptedWithContract = proposals.filter(p =>
    (p.status === "accepted" || p.stage_name === "accepted" || p.stage_name === "aceite") && p.contract_id
  );

  const isSent = (p: Proposal) =>
    p.status === "sent" || p.stage_name === "sent" || p.stage_name === "enviada";

  const daysSinceSent = (p: Proposal) =>
    differenceInDays(now, parseISO(p.sent_at || p.updated_at || p.created_at));

  const noResponseOver = noResponseEnabled ? proposals.filter(p => {
    if (!isSent(p)) return false;
    const d = daysSinceSent(p);
    return d >= noResponseDays && d < noResponseUrgentDays;
  }) : [];
  const noResponseUrgent = noResponseUrgentEnabled ? proposals.filter(p => {
    if (!isSent(p)) return false;
    return daysSinceSent(p) >= noResponseUrgentDays;
  }) : [];

  const noValidity = noValidityEnabled ? proposals.filter(p =>
    !p.valid_until &&
    p.status !== "rejected" && p.stage_name !== "rejected" && p.stage_name !== "rejeitada"
  ) : [];

  const expired = expiredEnabled ? proposals.filter(p =>
    p.valid_until && isPast(parseISO(p.valid_until)) &&
    p.status !== "accepted" && p.stage_name !== "accepted" && p.stage_name !== "aceite" &&
    p.status !== "rejected" && p.stage_name !== "rejected" && p.stage_name !== "rejeitada"
  ) : [];

  const isDraft = (p: Proposal) =>
    p.status === "draft" || p.status === "rascunho" || p.stage_name === "draft" || p.stage_name === "rascunho";

  const draftStale = draftStaleEnabled ? proposals.filter(p => {
    if (!isDraft(p)) return false;
    return differenceInDays(now, parseISO(p.updated_at || p.created_at)) >= draftStaleDays;
  }) : [];

  const totalCount =
    acceptedWithContract.length + noResponseOver.length + noResponseUrgent.length + noValidity.length + expired.length + draftStale.length;


  if (totalCount === 0) return null;

  // Determine the highest-priority tone for the summary bar
  const tone = expired.length > 0 || noResponseUrgent.length > 0
    ? "destructive"
    : noResponseOver.length > 0
      ? "warning"
      : noValidity.length > 0
        ? "info"
        : "success";

  const toneStyles: Record<string, string> = {
    destructive: "border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800",
    warning: "border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800",
    info: "border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800",
    success: "border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-800",
  };

  const toneIconColor: Record<string, string> = {
    destructive: "text-red-600",
    warning: "text-orange-600",
    info: "text-blue-600",
    success: "text-green-600",
  };

  const toneTextColor: Record<string, string> = {
    destructive: "text-red-800 dark:text-red-300",
    warning: "text-orange-800 dark:text-orange-300",
    info: "text-blue-800 dark:text-blue-300",
    success: "text-green-800 dark:text-green-300",
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={cn("rounded-lg border", toneStyles[tone])}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
          >
            <Bell className={cn("h-4 w-4 flex-shrink-0", toneIconColor[tone])} />
            <span className={cn("text-sm font-medium", toneTextColor[tone])}>
              {totalCount} {totalCount === 1 ? "alerta activo" : "alertas activos"}
            </span>
            <div className="flex items-center gap-1.5 ml-1">
              {(expired.length + noResponseUrgent.length) > 0 && (
                <Badge variant="outline" className="h-5 text-[10px] border-red-400 text-red-700 bg-red-100/50 dark:bg-red-950/50 dark:text-red-300">
                  {expired.length + noResponseUrgent.length} {expired.length > 0 && noResponseUrgent.length === 0 ? `expirada${expired.length > 1 ? "s" : ""}` : "urgente"}
                </Badge>
              )}
              {noResponseOver.length > 0 && (
                <Badge variant="outline" className="h-5 text-[10px] border-orange-400 text-orange-700 bg-orange-100/50 dark:bg-orange-950/50 dark:text-orange-300">
                  {noResponseOver.length} sem resposta
                </Badge>
              )}
              {noValidity.length > 0 && (
                <Badge variant="outline" className="h-5 text-[10px] border-blue-400 text-blue-700 bg-blue-100/50 dark:bg-blue-950/50 dark:text-blue-300">
                  {noValidity.length} sem validade
                </Badge>
              )}
              {draftStale.length > 0 && (
                <Badge variant="outline" className="h-5 text-[10px] border-amber-400 text-amber-700 bg-amber-100/50 dark:bg-amber-950/50 dark:text-amber-300">
                  {draftStale.length} rascunho{draftStale.length > 1 ? "s" : ""}
                </Badge>
              )}
              {acceptedWithContract.length > 0 && (
                <Badge variant="outline" className="h-5 text-[10px] border-green-400 text-green-700 bg-green-100/50 dark:bg-green-950/50 dark:text-green-300">
                  {acceptedWithContract.length} aceite{acceptedWithContract.length > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 ml-auto transition-transform flex-shrink-0",
                toneIconColor[tone],
                open && "rotate-180"
              )}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-current/10 p-2 space-y-2">
            {expired.length > 0 && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800">
                <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
                <span className="text-sm text-red-800 dark:text-red-300 font-medium">
                  {expired.length} proposta{expired.length > 1 ? "s" : ""} expirada{expired.length > 1 ? "s" : ""}
                </span>
                <span className="text-sm text-red-700 dark:text-red-400 hidden md:inline">
                  — prazo de validade ultrapassado.
                </span>
                <div className="ml-auto flex gap-1 flex-wrap">
                  {expired.slice(0, 3).map(p => (
                    <Button key={p.id} size="sm" className="h-7 bg-red-600 hover:bg-red-700 text-white text-xs" onClick={() => onOpenProposal?.(p.id)}>
                      {expired.length === 1 ? "Renovar validade" : p.title.slice(0, 15)}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {noResponseUrgent.length > 0 && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800">
                <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
                <span className="text-sm text-red-800 dark:text-red-300 font-medium">
                  {noResponseUrgent.length} proposta{noResponseUrgent.length > 1 ? "s" : ""}
                </span>
                <span className="text-sm text-red-700 dark:text-red-400 hidden md:inline">
                  sem resposta há +{noResponseUrgentDays} dias — escalar urgentemente
                </span>
                <div className="ml-auto flex gap-1 flex-wrap">
                  {noResponseUrgent.slice(0, 3).map(p => (
                    <Button key={p.id} variant="outline" size="sm" className="h-7 text-xs border-red-400 text-red-700 hover:bg-red-100 dark:text-red-300" onClick={() => onOpenProposal?.(p.id)}>
                      {p.title.slice(0, 15)}
                    </Button>
                  ))}
                  <Button size="sm" className="h-7 bg-red-600 hover:bg-red-700 text-white" onClick={() => onSendFollowUp?.(noResponseUrgent.map(p => p.id))}>
                    Escalar
                  </Button>
                </div>
              </div>
            )}

            {noResponseOver.length > 0 && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-md border border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800">
                <Clock className="h-4 w-4 text-orange-600 flex-shrink-0" />
                <span className="text-sm text-orange-800 dark:text-orange-300 font-medium">
                  {noResponseOver.length} proposta{noResponseOver.length > 1 ? "s" : ""}
                </span>
                <span className="text-sm text-orange-700 dark:text-orange-400 hidden md:inline">
                  enviada{noResponseOver.length > 1 ? "s" : ""} sem resposta há +{noResponseDays} dias
                </span>
                <div className="ml-auto flex gap-1 flex-wrap">
                  {noResponseOver.slice(0, 3).map(p => (
                    <Button key={p.id} variant="outline" size="sm" className="h-7 text-xs border-orange-400 text-orange-700 hover:bg-orange-100 dark:text-orange-300" onClick={() => onOpenProposal?.(p.id)}>
                      {p.title.slice(0, 15)}
                    </Button>
                  ))}
                  <Button size="sm" className="h-7 bg-orange-600 hover:bg-orange-700 text-white" onClick={() => onSendFollowUp?.(noResponseOver.map(p => p.id))}>
                    Enviar follow-up
                  </Button>
                </div>
              </div>
            )}

            {noValidity.length > 0 && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
                <Lightbulb className="h-4 w-4 text-blue-600 flex-shrink-0" />
                <span className="text-sm text-blue-800 dark:text-blue-300 font-medium">
                  {noValidity.length} proposta{noValidity.length > 1 ? "s" : ""}
                </span>
                <span className="text-sm text-blue-700 dark:text-blue-400 hidden md:inline">
                  sem data de validade definida
                </span>
                <div className="ml-auto flex gap-1 flex-wrap">
                  {noValidity.slice(0, 3).map(p => (
                    <Button key={p.id} size="sm" className="h-7 bg-blue-600 hover:bg-blue-700 text-white text-xs" onClick={() => onOpenProposal?.(p.id)}>
                      {noValidity.length === 1 ? "Definir validade" : p.title.slice(0, 15)}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {draftStale.length > 0 && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
                <Clock className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <span className="text-sm text-amber-800 dark:text-amber-300 font-medium">
                  {draftStale.length} rascunho{draftStale.length > 1 ? "s" : ""}
                </span>
                <span className="text-sm text-amber-700 dark:text-amber-400 hidden md:inline">
                  parado{draftStale.length > 1 ? "s" : ""} há +{draftStaleDays} dias — enviar ao cliente?
                </span>
                <div className="ml-auto flex gap-1 flex-wrap">
                  {draftStale.slice(0, 3).map(p => {
                    const days = differenceInDays(now, parseISO(p.updated_at || p.created_at));
                    return (
                      <Button key={p.id} variant="outline" size="sm" className="h-7 text-xs border-amber-400 text-amber-700 hover:bg-amber-100 dark:text-amber-300" onClick={() => onOpenProposal?.(p.id)}>
                        {p.title.slice(0, 15)} · {days}d
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}


            {acceptedWithContract.length > 0 && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-md border border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-800">
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span className="text-sm text-green-800 dark:text-green-300 font-medium">
                  {acceptedWithContract.length} proposta{acceptedWithContract.length > 1 ? "s" : ""} aceite{acceptedWithContract.length > 1 ? "s" : ""}
                </span>
                <span className="text-sm text-green-700 dark:text-green-400 hidden md:inline">
                  — contratos criados automaticamente.
                </span>
                <div className="ml-auto">
                  <Button size="sm" className="h-7 bg-green-600 hover:bg-green-700 text-white" onClick={onNavigateContracts}>
                    Ver contratos
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
