import { useState, useCallback, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calculator, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  CONTRACT_FORMULA_FIELDS,
  describeFormulaChip,
  type FormulaFormat,
  type FormulaOperation,
} from "@/utils/contracts/contractFormulaFields";


function escapeAttr(v: string): string {
  return String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const CHIP_STYLE = "display:inline-block;padding:2px 8px;margin:0 2px;border-radius:6px;background:#fef3c7;color:#92400e;font-size:12px;font-weight:500;border:1px solid #fcd34d;cursor:pointer;user-select:none;";

export function buildFormulaChipHtml(
  fieldKey: string,
  fieldLabel: string,
  op: FormulaOperation,
  value: number,
  format: FormulaFormat,
  prefix: string,
): string {
  const preview = describeFormulaChip(fieldLabel, op, value);
  const labelText = prefix ? `${prefix}${preview}` : preview;
  return `<span data-contract-formula="${escapeAttr(fieldKey)}" data-op="${op}" data-value="${value}" data-format="${format}" data-label="${escapeAttr(prefix)}" contenteditable="false" class="contract-formula-chip" style="${CHIP_STYLE}">${escapeAttr(labelText)}</span>`;
}

export function buildFormulaLabelChipHtml(text: string): string {
  return `<span data-contract-formula-label="true" contenteditable="false" class="contract-formula-chip" style="${CHIP_STYLE}">${escapeAttr(text)}</span>`;
}

interface Props {
  onInsertHtml: (html: string) => void;
  onBeforeOpen?: () => void;
}

export function FormulaInsertPopover({ onInsertHtml, onBeforeOpen }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<number>(50);
  const [label, setLabel] = useState<string>("");
  const [existingTotal, setExistingTotal] = useState<number>(0);

  const fieldKey = "contrato_valor";
  const op: FormulaOperation = "percent";
  const format: FormulaFormat = "currency";

  // Recompute current total % from all formula chips inside any editor
  // whenever the popover opens.
  useEffect(() => {
    if (!open) return;
    let total = 0;
    document.querySelectorAll<HTMLElement>(
      '[contenteditable="true"] [data-contract-formula][data-op="percent"]'
    ).forEach((el) => {
      const v = parseFloat(el.getAttribute("data-value") || "0");
      if (Number.isFinite(v)) total += v;
    });
    setExistingTotal(total);
  }, [open]);

  const pct = Number(value) || 0;
  const remaining = useMemo(() => Math.max(0, 100 - existingTotal), [existingTotal]);
  const wouldExceed = existingTotal + pct > 100 + 0.001;

  const insert = useCallback(() => {
    const field = CONTRACT_FORMULA_FIELDS.find(f => f.key === fieldKey);
    if (!field || !field.enabled) return;
    if (pct <= 0) {
      toast.error("Indique uma percentagem maior que 0.");
      return;
    }
    if (existingTotal + pct > 100 + 0.001) {
      toast.error(
        `Soma das parcelas não pode ultrapassar 100%. Já tem ${existingTotal}% — só pode adicionar até ${remaining}%.`
      );
      return;
    }
    const lbl = label.trim();
    const labelText = lbl ? `${pct}% - ${lbl}` : `${pct}%`;
    const labelChip = buildFormulaLabelChipHtml(labelText);
    const valueChip = buildFormulaChipHtml(field.key, field.label, op, pct, format, "");
    onInsertHtml(`${labelChip}&nbsp;${valueChip}&nbsp;`);
    setOpen(false);
  }, [pct, label, onInsertHtml, existingTotal, remaining]);

  const lbl = label.trim();
  const previewLabel = lbl ? `${pct}% - ${lbl}` : `${pct}%`;
  const previewValue = `${pct}% de Valor total do contrato`;

  return (
    <Popover open={open} onOpenChange={(o) => { if (o) onBeforeOpen?.(); setOpen(o); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Inserir parcela (% do valor do contrato)">
          <Calculator className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-3 z-[650] space-y-3" align="start">
        <div className="text-xs text-muted-foreground">
          Insere uma etiqueta e uma variável de valor (separadas, podes mover cada uma).
        </div>

        <div className="grid grid-cols-[80px,1fr] gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Percentagem</Label>
            <div className="relative">
              <Input
                type="number"
                step="any"
                value={value}
                onChange={e => setValue(parseFloat(e.target.value) || 0)}
                className="h-8 text-sm pr-6"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Etiqueta (opcional)</Label>
            <Input
              value={label}
              onChange={e => setLabel(e.target.value)}
              className="h-8 text-sm"
              placeholder="ex.: Adjudicação"
            />
          </div>
        </div>

        <div className="rounded border bg-muted/40 p-2 text-[11px] text-muted-foreground space-y-1">
          <div>Pré-visualização:</div>
          <div className="flex flex-wrap items-center gap-1">
            <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, background: "#fef3c7", color: "#92400e", fontSize: 12, fontWeight: 500, border: "1px solid #fcd34d" }}>{previewLabel}</span>
            <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, background: "#fef3c7", color: "#92400e", fontSize: 12, fontWeight: 500, border: "1px solid #fcd34d" }}>{previewValue}</span>
          </div>
          <div className="text-[10px]">No contrato: <span className="font-medium text-foreground">{previewLabel} 4.903,47 €</span></div>
        </div>

        <div className={`rounded border p-2 text-[11px] flex items-start gap-2 ${wouldExceed ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-border bg-muted/40 text-muted-foreground"}`}>
          {wouldExceed && <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />}
          <div className="space-y-0.5">
            <div>
              Parcelas já inseridas: <span className="font-medium">{existingTotal}%</span>
              {" · "}
              Disponível: <span className="font-medium">{remaining}%</span>
            </div>
            {wouldExceed && (
              <div>A soma das parcelas não pode ultrapassar 100%. Reduza para no máximo {remaining}%.</div>
            )}
          </div>
        </div>

        <Button type="button" size="sm" className="w-full" onClick={insert} disabled={wouldExceed || pct <= 0}>
          Inserir parcela
        </Button>
      </PopoverContent>
    </Popover>
  );
}
