/**
 * Picker compacto para escolher como um campo da template é preenchido.
 *
 * 3 modos:
 *   - "default"  → binding inteligente da Olyvia (não escreve nada em settings)
 *   - "variable" → escolha uma variável do registry (escreve fieldMappings[fieldKey])
 *   - "fixed"    → texto literal (escreve fieldFallbacks[fieldKey])
 *
 * Modo "Avançado" colapsado revela as chaves técnicas (client.email, ...).
 * Sem efeitos colaterais para templates antigos: enquanto fieldModes[fieldKey]
 * não existir, o picker mostra "Automático".
 */

import { useState } from "react";
import { Sparkles, Variable, Type, ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  getVariableDefinition,
  groupedVariables,
  resolveAlias,
  type FieldMode,
} from "@/utils/documentVariables";

export interface VariableBindingValue {
  mode: FieldMode;
  mapping?: string;
  fixed?: string;
}

interface VariableBindingProps {
  /** Etiqueta humana para mostrar no chip "Automático: <defaultLabel>" */
  defaultLabel: string;
  /** Chave canónica do registry usada como default (ex.: "client.email") */
  defaultRegistryKey: string;
  value: VariableBindingValue;
  onChange: (next: VariableBindingValue) => void;
  /** Tipo de input fixo (text por defeito) */
  fixedPlaceholder?: string;
}

export function VariableBinding({
  defaultLabel,
  defaultRegistryKey,
  value,
  onChange,
  fixedPlaceholder = "Texto a apresentar",
}: VariableBindingProps) {
  const [advanced, setAdvanced] = useState(false);
  const groups = groupedVariables();

  const chipLabel = (() => {
    if (value.mode === "fixed") return `Fixo: ${value.fixed?.slice(0, 24) || ""}`;
    if (value.mode === "variable") {
      const def = getVariableDefinition(resolveAlias(value.mapping || ""));
      return def ? def.label : "Variável";
    }
    // Modo automático: mostrar só o sub-rótulo (sem prefixo "Cliente ·")
    const short = defaultLabel.split("·").pop()?.trim() || defaultLabel;
    return `Auto: ${short}`;
  })();

  const chipIcon = value.mode === "fixed" ? Type : value.mode === "variable" ? Variable : Sparkles;
  const Icon = chipIcon;

  return (
    <TooltipProvider>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 px-2 gap-1 text-xs w-full justify-start min-w-0">
            <Icon className="w-3 h-3 shrink-0" />
            <span className="truncate min-w-0 flex-1 text-left">{chipLabel}</span>
            <Settings2 className="w-3 h-3 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3" align="end">
          <Tabs value={value.mode} onValueChange={(m) => onChange({ ...value, mode: m as FieldMode })}>
            <TabsList className="grid grid-cols-3 h-8">
              <TabsTrigger value="default" className="text-xs gap-1"><Sparkles className="w-3 h-3" />Auto</TabsTrigger>
              <TabsTrigger value="variable" className="text-xs gap-1"><Variable className="w-3 h-3" />Variável</TabsTrigger>
              <TabsTrigger value="fixed" className="text-xs gap-1"><Type className="w-3 h-3" />Fixo</TabsTrigger>
            </TabsList>

            <TabsContent value="default" className="mt-3">
              <div className="text-xs text-muted-foreground space-y-1">
                <p>A Olyvia preenche automaticamente:</p>
                <Badge variant="secondary" className="text-[10px]">{defaultLabel}</Badge>
              </div>
            </TabsContent>

            <TabsContent value="variable" className="mt-3 space-y-2 max-h-64 overflow-auto">
              {Object.entries(groups).map(([group, vars]) => (
                <div key={group} className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{group}</Label>
                  <div className="flex flex-col gap-1">
                    {vars.map((v) => {
                      const active = resolveAlias(value.mapping || "") === v.key;
                      return (
                        <button
                          key={v.key}
                          type="button"
                          onClick={() => onChange({ mode: "variable", mapping: v.key })}
                          className={`text-left text-xs px-2 py-1 rounded ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                        >
                          {v.label}
                          {advanced && <span className="ml-2 opacity-60 text-[10px]">{v.key}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setAdvanced((a) => !a)}
                className="text-[10px] text-muted-foreground hover:underline flex items-center gap-1 pt-1"
              >
                {advanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {advanced ? "Ocultar chaves técnicas" : "Mostrar chaves técnicas"}
              </button>
            </TabsContent>

            <TabsContent value="fixed" className="mt-3 space-y-2">
              <Label className="text-xs">Texto literal</Label>
              <Input
                value={value.fixed || ""}
                onChange={(e) => onChange({ mode: "fixed", fixed: e.target.value })}
                placeholder={fixedPlaceholder}
                className="h-8 text-xs"
              />
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}

/**
 * Helper para extrair/atualizar a VariableBindingValue a partir de section.settings.
 */
export function readBinding(settings: any, fieldKey: string): VariableBindingValue {
  const mode: FieldMode = settings?.fieldModes?.[fieldKey] || "default";
  return {
    mode,
    mapping: settings?.fieldMappings?.[fieldKey],
    fixed: settings?.fieldFallbacks?.[fieldKey],
  };
}

export function applyBinding(settings: any, fieldKey: string, next: VariableBindingValue): any {
  const fieldModes = { ...(settings?.fieldModes || {}) };
  const fieldMappings = { ...(settings?.fieldMappings || {}) };
  const fieldFallbacks = { ...(settings?.fieldFallbacks || {}) };

  if (next.mode === "default") {
    delete fieldModes[fieldKey];
    delete fieldMappings[fieldKey];
    delete fieldFallbacks[fieldKey];
  } else {
    fieldModes[fieldKey] = next.mode;
    if (next.mode === "variable") {
      if (next.mapping) fieldMappings[fieldKey] = next.mapping;
      delete fieldFallbacks[fieldKey];
    } else if (next.mode === "fixed") {
      fieldFallbacks[fieldKey] = next.fixed || "";
      delete fieldMappings[fieldKey];
    }
  }

  return { ...settings, fieldModes, fieldMappings, fieldFallbacks };
}
