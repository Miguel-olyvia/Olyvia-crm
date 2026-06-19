/**
 * ItemsTableSettings — painel context-aware para configurar a tabela de artigos
 * em templates de proposta/orçamento/contrato.
 *
 * REGRAS (.lovable/plan.md §7):
 * - Só layout/estética. NÃO mexe em valores, pricing, IVA, fees ou totais.
 * - Multi-orçamento (`mode`) só aparece quando `context === "proposal"` ou
 *   quando o contrato vem de proposta com 2+ orçamentos (controlado pelo pai
 *   via `allowMultiQuoteMode`).
 * - Aditivo: não há consumidores wired-in nesta fase; só renderiza e emite
 *   `onChange` com o patch parcial.
 */

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  DocumentContext,
  ItemsTableSettings as ItemsTableSettingsType,
  ItemsTableMode,
} from "@/utils/documentTemplate/types";

interface Props {
  context: DocumentContext;
  value: ItemsTableSettingsType;
  onChange: (patch: Partial<ItemsTableSettingsType>) => void;
  /** Override para contratos vindos de proposta com 2+ orçamentos. */
  allowMultiQuoteMode?: boolean;
}

const MODE_OPTIONS: { value: ItemsTableMode; label: string; description: string }[] = [
  { value: "grouped_by_quote", label: "Agrupado por orçamento", description: "Bloco por orçamento, com subtotal por bloco e total geral." },
  { value: "consolidated",     label: "Consolidado",            description: "Uma tabela única com referência ao orçamento de origem." },
];

export function ItemsTableSettings({ context, value, onChange, allowMultiQuoteMode }: Props) {
  const showMultiQuote = context === "proposal" || (context === "contract" && allowMultiQuoteMode === true);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tabela de Artigos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {showMultiQuote && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Quando há 2+ orçamentos</Label>
            <RadioGroup
              value={value.mode ?? "grouped_by_quote"}
              onValueChange={(v) => onChange({ mode: v as ItemsTableMode })}
              className="space-y-2"
            >
              {MODE_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-start gap-2 p-2 rounded border">
                  <RadioGroupItem value={opt.value} id={`mode-${opt.value}`} className="mt-1" />
                  <Label htmlFor={`mode-${opt.value}`} className="cursor-pointer flex-1 font-normal">
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.description}</div>
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <p className="text-[11px] text-muted-foreground">
              Com apenas 1 orçamento, esta opção é ignorada e a tabela renderiza como hoje.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {showMultiQuote && (value.mode ?? "grouped_by_quote") === "consolidated" && (
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Mostrar coluna "Orçamento"</Label>
                <p className="text-xs text-muted-foreground">Identifica a origem de cada linha.</p>
              </div>
              <Switch
                checked={value.show_quote_ref_column ?? true}
                onCheckedChange={(checked) => onChange({ show_quote_ref_column: checked })}
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Mostrar subtotais</Label>
              <p className="text-xs text-muted-foreground">Subtotal por orçamento e total geral.</p>
            </div>
            <Switch
              checked={value.show_subtotals ?? true}
              onCheckedChange={(checked) => onChange({ show_subtotals: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Linhas zebradas</Label>
              <p className="text-xs text-muted-foreground">Alterna fundo claro/escuro entre linhas.</p>
            </div>
            <Switch
              checked={value.zebra_rows ?? true}
              onCheckedChange={(checked) => onChange({ zebra_rows: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Modo compacto</Label>
              <p className="text-xs text-muted-foreground">Reduz padding vertical das linhas.</p>
            </div>
            <Switch
              checked={value.compact ?? false}
              onCheckedChange={(checked) => onChange({ compact: checked })}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ItemsTableSettings;
