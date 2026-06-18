import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Wand2, ArrowRight, Check, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface VariableSuggestion {
  id: string;
  found: string;
  variable: string;
  variableLabel: string;
  category: string;
}

interface VariableDetectionAssistantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  html: string;
  onApply: (newHtml: string) => void;
}

const DETECTION_PATTERNS: { pattern: RegExp; variable: string; label: string; category: string }[] = [
  // NIF patterns (9 digits)
  { pattern: /\b(\d{9})\b/g, variable: "{{cliente_nif}}", label: "NIF do Cliente", category: "Cliente" },
  // € values
  { pattern: /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*€/g, variable: "{{contrato_valor}}", label: "Valor do Contrato", category: "Contrato" },
  { pattern: /€\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/g, variable: "{{contrato_valor}}", label: "Valor do Contrato", category: "Contrato" },
  // Dates in DD/MM/YYYY or DD-MM-YYYY or DD de Mês de YYYY
  { pattern: /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\b/g, variable: "{{contrato_data_inicio}}", label: "Data de Início", category: "Contrato" },
  { pattern: /\b(\d{1,2}\s+de\s+(?:Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\s+de\s+\d{4})\b/gi, variable: "{{contrato_data_inicio}}", label: "Data de Início", category: "Contrato" },
  // Email
  { pattern: /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g, variable: "{{cliente_email}}", label: "Email do Cliente", category: "Cliente" },
  // Phone numbers (Portuguese format)
  { pattern: /\b((?:9[1236]\d|2[1-9]\d)\s?\d{3}\s?\d{3})\b/g, variable: "{{cliente_telefone}}", label: "Telefone do Cliente", category: "Cliente" },
  { pattern: /\b(\+351\s?\d{3}\s?\d{3}\s?\d{3})\b/g, variable: "{{cliente_telefone}}", label: "Telefone do Cliente", category: "Cliente" },
  // Postal codes (Portuguese)
  { pattern: /\b(\d{4}-\d{3})\b/g, variable: "{{cliente_morada}}", label: "Morada do Cliente", category: "Cliente" },
];

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function detectVariables(html: string): VariableSuggestion[] {
  const plainText = stripHtml(html);
  const suggestions: VariableSuggestion[] = [];
  const seen = new Set<string>();

  for (const { pattern, variable, label, category } of DETECTION_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(plainText)) !== null) {
      const found = match[0];
      const key = `${variable}:${found}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({
        id: `${variable}_${suggestions.length}`,
        found,
        variable,
        variableLabel: label,
        category,
      });
    }
  }

  return suggestions;
}

export function VariableDetectionAssistant({ open, onOpenChange, html, onApply }: VariableDetectionAssistantProps) {
  const suggestions = useMemo(() => detectVariables(html), [html]);
  const [selected, setSelected] = useState<Set<string>>(new Set(suggestions.map(s => s.id)));

  const toggleSuggestion = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApply = () => {
    let result = html;
    const toApply = suggestions.filter(s => selected.has(s.id));

    // Sort by length descending to avoid partial replacements
    toApply.sort((a, b) => b.found.length - a.found.length);

    for (const s of toApply) {
      // Escape the found text for regex
      const escaped = s.found.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Replace in HTML content but not inside tags
      result = result.replace(new RegExp(escaped, "g"), s.variable);
    }

    onApply(result);
    onOpenChange(false);
  };

  const groupedByCategory = useMemo(() => {
    const groups: Record<string, VariableSuggestion[]> = {};
    for (const s of suggestions) {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category].push(s);
    }
    return groups;
  }, [suggestions]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" /> Assistente de Variáveis
          </DialogTitle>
          <DialogDescription>
            {suggestions.length > 0
              ? "Detectámos campos que podem ser variáveis. Seleccione os que pretende substituir automaticamente."
              : "Não foram detectados padrões para substituição automática. Pode inserir variáveis manualmente no editor."}
          </DialogDescription>
        </DialogHeader>

        {suggestions.length > 0 ? (
          <>
            <ScrollArea className="flex-1 max-h-[50vh]">
              <div className="space-y-4 pr-3">
                {Object.entries(groupedByCategory).map(([category, items]) => (
                  <div key={category}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{category}</p>
                    <div className="space-y-2">
                      {items.map(s => (
                        <label
                          key={s.id}
                          className="flex items-start gap-3 p-2.5 rounded-md border cursor-pointer hover:bg-muted/30 transition-colors"
                        >
                          <Checkbox
                            checked={selected.has(s.id)}
                            onCheckedChange={() => toggleSuggestion(s.id)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <code className="text-xs bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded line-through">
                                {s.found}
                              </code>
                              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                              <Badge variant="outline" className="text-xs font-mono bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200">
                                {s.variable}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{s.variableLabel}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
              <span>{selected.size} de {suggestions.length} seleccionados</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelected(new Set(suggestions.map(s => s.id)))}>
                  <Check className="h-3 w-3 mr-1" /> Todos
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelected(new Set())}>
                  <X className="h-3 w-3 mr-1" /> Nenhum
                </Button>
              </div>
            </div>
          </>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {suggestions.length > 0 ? "Ignorar" : "Fechar"}
          </Button>
          {suggestions.length > 0 && (
            <Button onClick={handleApply} disabled={selected.size === 0}>
              <Wand2 className="h-4 w-4 mr-1.5" /> Substituir {selected.size} {selected.size === 1 ? "campo" : "campos"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
