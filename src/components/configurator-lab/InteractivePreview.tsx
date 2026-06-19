/**
 * InteractivePreview — preview interactivo estrutural do configurador (Fase 3).
 *
 * Renderizado lado-a-lado com ConfigPreviewPanel (não substitui).
 * Sem cálculo de preço. Sem chamadas a quotes/proposals/bundles.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, AlertTriangle, Info, Loader2 } from "lucide-react";
import { useConfigRuntime } from "./hooks/useConfigRuntime";
import { QuoteLinePreview } from "./QuoteLinePreview";

interface Props {
  productId: string | null;
  organizationId: string | null;
  templateId?: string | null;
  isInactiveVersion?: boolean;
}

export function InteractivePreview({
  productId,
  organizationId,
  templateId = null,
  isInactiveVersion = false,
}: Props) {
  const [priceContext, setPriceContext] = useState<string>("");
  const ctx = priceContext.trim() ? priceContext.trim() : null;

  const {
    resolving,
    resolveError,
    resolved,
    selection,
    setSlotValue,
    validating,
    errors,
    warnings,
    effectiveOptions,
    hiddenSlots,
    requiredSlots,
  } = useConfigRuntime({ productId, organizationId, priceContext: ctx, templateId });

  if (!productId || !organizationId) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">Preview interactivo</CardTitle>
            <CardDescription className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" />
              Estrutura + regras em tempo real. Sem cálculo de preço nesta fase.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isInactiveVersion && (
              <Badge variant="outline" className="text-xs">versão inativa</Badge>
            )}
            {validating && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {errors.length > 0 && (
              <Badge variant="destructive" className="text-xs">{errors.length} erro(s)</Badge>
            )}
            {warnings.length > 0 && (
              <Badge variant="outline" className="text-xs">{warnings.length} aviso(s)</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Price context selector */}
        <div className="flex items-end gap-3">
          <div className="flex-1 max-w-xs space-y-1.5">
            <Label htmlFor="ctx" className="text-xs">price_context (code)</Label>
            <Input
              id="ctx"
              placeholder="ex.: retail"
              value={priceContext}
              onChange={(e) => setPriceContext(e.target.value)}
            />
          </div>
          {resolved?.price_context_id && (
            <Badge variant="secondary" className="text-xs mb-2">contexto resolvido</Badge>
          )}
        </div>

        {resolved?.price_context_warning && (
          <Alert variant="default">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">{resolved.price_context_warning}</AlertDescription>
          </Alert>
        )}

        {resolveError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erro</AlertTitle>
            <AlertDescription className="text-xs">
              {resolveError === "forbidden"
                ? "Sem permissão para este produto nesta organização."
                : resolveError}
            </AlertDescription>
          </Alert>
        )}

        {resolving && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> A resolver template…
          </div>
        )}

        {!resolving && resolved && !resolved.template && (
          <div className="text-sm text-muted-foreground text-center py-6">
            Sem template ativo para este produto.
          </div>
        )}

        {resolved?.template && (
          <div className="space-y-4">
            {resolved.blocks.map((b) => {
              const blockSlots = resolved.slots
                .filter((s) => s.block_id === b.id)
                .filter((s) => !hiddenSlots.has(s.id));
              if (blockSlots.length === 0) return null;
              return (
                <div key={b.id} className="border rounded-md p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-sm">{b.label}</div>
                    {b.is_required && <Badge variant="outline" className="text-xs">obrigatório</Badge>}
                  </div>
                  {blockSlots.map((s) => {
                    const allOpts = resolved.options.filter((o) => o.slot_id === s.id);
                    const eff = new Set(effectiveOptions[s.id] ?? []);
                    const isReq = requiredSlots.has(s.id);
                    const sel = selection[s.id];

                    return (
                      <div key={s.id} className="ml-1 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">{s.label}</Label>
                          <Badge variant="secondary" className="text-xs">{s.slot_type}</Badge>
                          {isReq && <Badge variant="outline" className="text-xs">obrig.</Badge>}
                        </div>
                        {renderControl(s, allOpts, eff, sel, (v) => setSlotValue(s.id, v))}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Errors list */}
            {(errors.length > 0 || warnings.length > 0) && (
              <div className="space-y-2">
                {errors.map((e, i) => (
                  <Alert key={`e-${i}`} variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">{e.message}</AlertDescription>
                  </Alert>
                ))}
                {warnings.map((w, i) => (
                  <Alert key={`w-${i}`}>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">{w.message}</AlertDescription>
                  </Alert>
                ))}
              </div>
            )}

            {/* Pricing placeholder */}
            <div className="border-t pt-3">
              <div className="text-xs text-muted-foreground">Preço estimado</div>
              <div className="text-sm italic text-muted-foreground">
                Cálculo de preço será adicionado na próxima fase.
              </div>
            </div>

            {/* Mini preview de linha de orçamento (não interfere no resto) */}
            <QuoteLinePreview
              resolved={resolved}
              selection={selection}
              hasErrors={errors.length > 0}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function renderControl(
  slot: { id: string; slot_type: string; label: string; min_quantity: number | null; max_quantity: number | null },
  allOpts: { id: string; label: string; is_enabled: boolean }[],
  effective: Set<string>,
  sel: any,
  onChange: (v: any) => void
) {
  if (slot.slot_type === "attribute_value" || slot.slot_type === "component_product") {
    const current = sel?.option_id ?? "";
    return (
      <TooltipProvider>
        <Select
          value={current}
          onValueChange={(v) => onChange({ option_id: v })}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Selecionar…" />
          </SelectTrigger>
          <SelectContent>
            {allOpts.map((o) => {
              const allowed = o.is_enabled && effective.has(o.id);
              const item = (
                <SelectItem
                  key={o.id}
                  value={o.id}
                  disabled={!allowed}
                  className={!allowed ? "text-muted-foreground opacity-60" : ""}
                >
                  {o.label}
                  {!allowed && <span className="ml-2 text-xs">(indisponível)</span>}
                </SelectItem>
              );
              return allowed ? (
                item
              ) : (
                <Tooltip key={o.id}>
                  <TooltipTrigger asChild>
                    <div>{item}</div>
                  </TooltipTrigger>
                  <TooltipContent>Bloqueada por uma regra ou desativada</TooltipContent>
                </Tooltip>
              );
            })}
          </SelectContent>
        </Select>
      </TooltipProvider>
    );
  }

  if (slot.slot_type === "quantity" || slot.slot_type === "measure") {
    return (
      <Input
        type="number"
        className="h-9"
        min={slot.min_quantity ?? undefined}
        max={slot.max_quantity ?? undefined}
        value={sel?.quantity ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : { quantity: Number(e.target.value) })
        }
      />
    );
  }

  if (slot.slot_type === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Switch
          checked={!!sel?.value}
          onCheckedChange={(v) => onChange({ value: v })}
        />
        <span className="text-xs text-muted-foreground">{sel?.value ? "Sim" : "Não"}</span>
      </div>
    );
  }

  // custom_input
  return (
    <Input
      type="text"
      className="h-9"
      value={(sel?.value as string) ?? ""}
      onChange={(e) => onChange({ value: e.target.value })}
    />
  );
}
