// Shared, context-aware variable picker for document templates
// (proposals, quotes, contracts).
//
// Additive: this component does NOT replace existing inserters yet.
// Reads from src/utils/documentTemplate/variables.ts (descriptive
// registry). No data writes, no schema changes.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Braces, Search } from "lucide-react";
import {
  type DocumentVariableContext,
  type DocumentVariableGroup,
  getDocumentTemplateVariablesForContext,
  groupDocumentTemplateVariables,
  DOCUMENT_VARIABLE_GROUP_LABELS,
} from "@/utils/documentTemplate/variables";

interface VariablePickerProps {
  context: DocumentVariableContext;
  onInsert: (key: string) => void;
  triggerLabel?: string;
  className?: string;
}

export function VariablePicker({ context, onInsert, triggerLabel = "Inserir variável", className }: VariablePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const variables = getDocumentTemplateVariablesForContext(context).filter((v) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        v.key.toLowerCase().includes(q) ||
        v.label.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q)
      );
    });
    return groupDocumentTemplateVariables(variables);
  }, [context, query]);

  const handleInsert = (key: string) => {
    onInsert(key);
    setOpen(false);
  };

  const entries = Object.entries(grouped) as [DocumentVariableGroup, ReturnType<typeof getDocumentTemplateVariablesForContext>][];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={className}>
          <Braces className="h-4 w-4 mr-2" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar variável..."
              className="pl-8 h-8"
            />
          </div>
        </div>
        <ScrollArea className="h-80">
          <div className="p-2 space-y-3">
            {entries.map(([group, vars]) => (
              <div key={group}>
                <div className="text-xs font-semibold text-muted-foreground px-2 mb-1 uppercase tracking-wide">
                  {DOCUMENT_VARIABLE_GROUP_LABELS[group]}
                </div>
                <div className="space-y-1">
                  {vars.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => handleInsert(v.key)}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <code className="text-xs font-mono text-primary">{v.key}</code>
                        {v.aliases && v.aliases.length > 0 && (
                          <Badge variant="outline" className="text-[10px]">alias</Badge>
                        )}
                      </div>
                      <div className="text-xs font-medium mt-0.5">{v.label}</div>
                      <div className="text-[11px] text-muted-foreground">{v.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {entries.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-8">
                Nenhuma variável encontrada.
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export default VariablePicker;
