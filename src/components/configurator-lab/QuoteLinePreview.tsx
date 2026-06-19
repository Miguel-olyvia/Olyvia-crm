/**
 * QuoteLinePreview — mostra como a configuração atual ficaria como linha de orçamento.
 *
 * Componente puramente apresentacional. Não faz fetch, não calcula preço,
 * não escreve em quote_lines. Lê a `selection` e o `resolved` que o
 * InteractivePreview já tem do useConfigRuntime.
 */
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileText, AlertTriangle } from "lucide-react";
import type { ConfigSelection, ResolveResult, ResolvedSlot, ResolvedOption } from "@/lib/configurator-runtime";

interface Props {
  resolved: ResolveResult | null;
  selection: ConfigSelection;
  hasErrors: boolean;
}

function formatValue(slot: ResolvedSlot, sel: ConfigSelection[string], options: ResolvedOption[]): string | null {
  if (sel === null || sel === undefined) return null;

  if (slot.slot_type === "attribute_value" || slot.slot_type === "component_product") {
    if (!sel.option_id) return null;
    const opt = options.find((o) => o.id === sel.option_id);
    return opt?.label ?? null;
  }

  if (slot.slot_type === "quantity" || slot.slot_type === "measure") {
    if (sel.quantity === undefined || sel.quantity === null || Number.isNaN(sel.quantity)) return null;
    return String(sel.quantity);
  }

  if (slot.slot_type === "boolean") {
    if (typeof sel.value !== "boolean") return null;
    return sel.value ? "Sim" : "Não";
  }

  // custom_input
  if (sel.value === undefined || sel.value === null || sel.value === "") return null;
  return String(sel.value);
}

export function QuoteLinePreview({ resolved, selection, hasErrors }: Props) {
  if (!resolved?.template) return null;

  // Construir pares { block, slot, valueLabel } só para slots com valor preenchido
  const filled = resolved.slots
    .map((slot) => {
      const opts = resolved.options.filter((o) => o.slot_id === slot.id);
      const valueLabel = formatValue(slot, selection[slot.id], opts);
      if (!valueLabel) return null;
      const block = resolved.blocks.find((b) => b.id === slot.block_id) ?? null;
      return { slot, block, valueLabel };
    })
    .filter((x): x is { slot: ResolvedSlot; block: typeof resolved.blocks[number] | null; valueLabel: string } => !!x);

  const isEmpty = filled.length === 0;

  // Descrição condensada estilo linha de orçamento
  const condensed = filled
    .map((f) => `${f.slot.label}: ${f.valueLabel}`)
    .join(" · ");

  // Agrupar por bloco para listagem detalhada
  const byBlock = new Map<string, { blockLabel: string; items: typeof filled }>();
  filled.forEach((f) => {
    const key = f.block?.id ?? "__no_block__";
    const blockLabel = f.block?.label ?? "Sem bloco";
    if (!byBlock.has(key)) byBlock.set(key, { blockLabel, items: [] });
    byBlock.get(key)!.items.push(f);
  });

  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Pré-visualização de linha de orçamento
            </CardTitle>
            <CardDescription>
              Como esta configuração apareceria numa linha de orçamento.
            </CardDescription>
          </div>
          {hasErrors && (
            <Badge variant="destructive" className="text-xs">Configuração incompleta</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isEmpty ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            Faz uma seleção acima para veres como apareceria na linha de orçamento.
          </div>
        ) : (
          <>
            {/* Bloco "linha" (descrição + qtd + preço placeholder) */}
            <div className="rounded-md border bg-muted/40 p-3 space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Descrição</div>
              <div className="text-sm font-medium leading-snug">
                {resolved.template.name}
                {condensed && (
                  <>
                    <span className="text-muted-foreground"> — </span>
                    <span className="font-normal">{condensed}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-6 pt-1 text-xs">
                <div>
                  <span className="text-muted-foreground">Qtd: </span>
                  <span className="font-medium">1</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Preço: </span>
                  <span className="italic text-muted-foreground">— a calcular</span>
                </div>
              </div>
            </div>

            {/* Detalhes agrupados por bloco */}
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Detalhes da configuração
              </div>
              {Array.from(byBlock.values()).map((group, gi) => (
                <div key={gi} className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">{group.blockLabel}</div>
                  <ul className="space-y-1">
                    {group.items.map(({ slot, valueLabel }) => (
                      <li
                        key={slot.id}
                        className="flex items-baseline justify-between gap-3 text-sm border-b border-dashed border-border/60 pb-1"
                      >
                        <span className="text-muted-foreground">{slot.label}</span>
                        <span className="font-medium text-right">{valueLabel}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {hasErrors && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Esta pré-visualização é só ilustrativa: a configuração atual tem erros
                  (campos obrigatórios em falta ou opções bloqueadas por regras) e ainda
                  não poderia ser inserida num orçamento.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
