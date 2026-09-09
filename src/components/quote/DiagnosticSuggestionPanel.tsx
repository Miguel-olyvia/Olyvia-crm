import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Check, X, Info, Loader2, RotateCcw, Sparkles } from "lucide-react";
import type { DiagnosticSuggestion } from "@/hooks/useQuoteDiagnosticSuggestions";

interface DiagnosticSuggestionPanelProps {
  suggestions: DiagnosticSuggestion[];
  isLoadingRules: boolean;
  isLoadingAiFallback: boolean;
  aiError: string | null;
  onAccept: (suggestion: DiagnosticSuggestion) => void;
  onReject: (suggestion: DiagnosticSuggestion) => void;
  onQtyChange: (suggestion: DiagnosticSuggestion, newQty: number) => void;
  onRetry?: () => void;
}

/**
 * Lista de sugestões (regra ou IA) para um campo do diagnóstico da Fase 1.
 * Puramente apresentacional — todo o estado (aceites/rejeitadas, pedido de
 * nova pesquisa) vive em QuoteDiagnosticPhase.
 */
export function DiagnosticSuggestionPanel({
  suggestions,
  isLoadingRules,
  isLoadingAiFallback,
  aiError,
  onAccept,
  onReject,
  onQtyChange,
  onRetry,
}: DiagnosticSuggestionPanelProps) {
  if (isLoadingRules) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1.5">
        <Skeleton className="h-3 w-3 rounded-full" />
        A procurar sugestões...
      </div>
    );
  }

  if (suggestions.length === 0) {
    if (isLoadingAiFallback) {
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          A procurar sugestão mais detalhada com IA...
        </div>
      );
    }

    if (aiError) {
      return (
        <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
          <span className="text-amber-700">Sugestão automática indisponível de momento.</span>
          {onRetry && (
            <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onRetry}>
              <RotateCcw className="h-3 w-3 mr-1" /> Tentar novamente
            </Button>
          )}
        </div>
      );
    }

    return (
      <p className="text-xs text-muted-foreground py-1.5">
        Sem sugestões automáticas para este texto — pode adicionar itens manualmente mais tarde.
      </p>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-1.5">
        {suggestions.map((suggestion) => (
          <div
            key={suggestion.client_id}
            className="flex items-center gap-2 rounded-md border bg-background/60 px-2.5 py-1.5"
          >
            <Badge variant={suggestion.source === "ai" ? "default" : "secondary"} className="shrink-0 text-[10px]">
              {suggestion.source === "ai" ? (
                <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> IA</span>
              ) : (
                "Regra"
              )}
            </Badge>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{suggestion.descricao}</p>
            </div>

            <Input
              type="number"
              min={0}
              step="0.01"
              value={suggestion.qty}
              onChange={(e) => onQtyChange(suggestion, Number(e.target.value) || 0)}
              className="h-7 w-20 text-xs"
            />
            {suggestion.unidade && (
              <span className="w-10 shrink-0 text-xs text-muted-foreground">{suggestion.unidade}</span>
            )}

            {suggestion.source === "ai" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Detalhes da sugestão da IA">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {suggestion.rationale && <p>{suggestion.rationale}</p>}
                  {typeof suggestion.confidence === "number" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {Math.round(suggestion.confidence * (suggestion.confidence <= 1 ? 100 : 1))}% confiança
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            )}

            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0 text-green-600 hover:text-green-700 hover:bg-green-500/10"
              onClick={() => onAccept(suggestion)}
              aria-label="Aceitar sugestão"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
              onClick={() => onReject(suggestion)}
              aria-label="Rejeitar sugestão"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
