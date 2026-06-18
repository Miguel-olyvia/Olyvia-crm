import { useState } from "react";
import { CheckCircle2, Clock, Mail, AlertTriangle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { differenceInDays, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface Quote {
  id: string;
  quote_number: string | null;
  title?: string | null;
  estado: string;
  created_at: string;
  sent_at?: string | null;
  updated_at?: string;
  proposal_id?: string | null;
}

interface QuoteLinesAgg {
  quoteId: string;
  totalValue: number;
  totalCost: number;
  hasCostData: boolean;
  margin: number;
}

interface QuotesAlertBarsProps {
  quotes: Quote[];
  linesAgg: Record<string, QuoteLinesAgg>;
  onNavigateProposals?: () => void;
  onOpenQuote?: (quote: Quote) => void;
  onViewLowMargin?: () => void;
  showMarginAlerts?: boolean;
  staleDraftDays?: number;
  pendingSentDays?: number;
  staleDraftEnabled?: boolean;
  pendingSentEnabled?: boolean;
}

export function QuotesAlertBars({ quotes, linesAgg, onNavigateProposals, onOpenQuote, onViewLowMargin, showMarginAlerts = true, staleDraftDays = 7, pendingSentDays = 5, staleDraftEnabled = true, pendingSentEnabled = true }: QuotesAlertBarsProps) {
  const [showStaleDrafts, setShowStaleDrafts] = useState(false);
  const now = new Date();

  const aceitesWithProposal = quotes.filter(q => q.estado === "aceite" && q.proposal_id);
  const staleDrafts = staleDraftEnabled
    ? quotes.filter(q => q.estado === "rascunho" && differenceInDays(now, parseISO(q.created_at)) >= staleDraftDays)
    : [];
  const pendingSent = pendingSentEnabled
    ? quotes.filter(q => q.estado === "enviado" && differenceInDays(now, parseISO(q.sent_at || q.updated_at || q.created_at)) > pendingSentDays)
    : [];
  const lowMarginQuotes = showMarginAlerts ? quotes.filter(q => {
    const agg = linesAgg[q.id];
    return agg?.hasCostData && agg.margin < 15 && agg.totalValue > 0 && q.estado !== "perdido";
  }) : [];

  if (!aceitesWithProposal.length && !staleDrafts.length && !pendingSent.length && !lowMarginQuotes.length) {
    return null;
  }

  return (
    <div className="flex-shrink-0 px-4 md:px-6 space-y-2">
      {aceitesWithProposal.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-800">
          <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
          <span className="text-sm text-green-800 dark:text-green-300 font-medium">
            {aceitesWithProposal.length} orçamento{aceitesWithProposal.length > 1 ? "s" : ""} aceite{aceitesWithProposal.length > 1 ? "s" : ""}
          </span>
          <span className="text-sm text-green-700 dark:text-green-400">
            — as propostas foram criadas automaticamente pelo workflow.
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="link" size="sm" className="text-green-700 dark:text-green-300 h-7 px-2" onClick={onNavigateProposals}>
              Ver propostas criadas
            </Button>
            <Button size="sm" className="h-7 bg-green-600 hover:bg-green-700 text-white" onClick={onNavigateProposals}>
              Ver propostas
            </Button>
          </div>
        </div>
      )}

      {staleDrafts.length > 0 && (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800"
          onClick={() => setShowStaleDrafts((open) => !open)}
        >
          <div className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
            <Clock className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <span className="text-sm text-amber-800 dark:text-amber-300">
              <strong>{staleDrafts.length}</strong> rascunho{staleDrafts.length > 1 ? "s" : ""} há mais de {staleDraftDays} dias — enviar ao cliente?
            </span>
            <Button variant="link" size="sm" className="ml-auto h-7 px-2 text-amber-800 dark:text-amber-300">
              Ver quais são
            </Button>
            <ChevronDown className={cn("h-4 w-4 text-amber-700 transition-transform", showStaleDrafts && "rotate-180")} />
          </div>
          {showStaleDrafts && (
            <div className="flex flex-wrap gap-2 border-t border-amber-300/60 px-4 py-2.5 dark:border-amber-800/60">
              {staleDrafts.map((quote) => (
                <Button
                  key={quote.id}
                  variant="outline"
                  size="sm"
                  className="h-7 border-amber-400 text-xs text-amber-800 hover:bg-amber-100 dark:text-amber-300"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenQuote?.(quote);
                  }}
                >
                  {quote.quote_number || quote.title || `Orçamento ${quote.id.slice(0, 8)}`}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {pendingSent.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800">
          <Mail className="h-4 w-4 text-orange-600 flex-shrink-0" />
          <span className="text-sm text-orange-800 dark:text-orange-300">
            <strong>{pendingSent.length}</strong> orçamento{pendingSent.length > 1 ? "s" : ""} enviado{pendingSent.length > 1 ? "s" : ""} sem resposta há +{pendingSentDays} dias — sugerir follow-up.
          </span>
        </div>
      )}

      {lowMarginQuotes.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800">
          <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
          <span className="text-sm text-red-800 dark:text-red-300">
            <strong>{lowMarginQuotes.length}</strong> orçamento{lowMarginQuotes.length > 1 ? "s" : ""} com margem abaixo de 15% — rever preços.
          </span>
          {onViewLowMargin && (
            <Button
              variant="link"
              size="sm"
              className="ml-auto h-7 px-2 text-red-800 dark:text-red-300"
              onClick={onViewLowMargin}
            >
              Ver quais são
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
