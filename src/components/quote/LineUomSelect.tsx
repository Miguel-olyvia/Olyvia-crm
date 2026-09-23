import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatPackBreakdown, getLineUnitsPerUom, type LineUomFields, type LineUomOption } from "@/utils/quotes/lineUom";

// Seletor "Unidade" de uma linha de produto: a unidade do produto + as
// embalagens dela (ex. un / PK10 / CX50). É um Select do Radix (não um
// Popover+Command), por isso funciona dentro de um Dialog sem precisar de
// `modal` — o conteúdo vai para um portal com o seu próprio foco.

interface LineUomSelectProps {
  options: LineUomOption[];
  line: LineUomFields & { unidade?: string | null };
  onChange: (option: LineUomOption) => void;
  disabled?: boolean;
  className?: string;
}

export function LineUomSelect({ options, line, onChange, disabled, className }: LineUomSelectProps) {
  const base = options.find((o) => o.isBase);
  const current = line.uom_id ? options.find((o) => o.id === line.uom_id) : base;
  return (
    <Select
      value={current?.id}
      onValueChange={(id) => {
        const option = options.find((o) => o.id === id);
        if (option && option.id !== current?.id) onChange(option);
      }}
      disabled={disabled}
    >
      <SelectTrigger className={cn("h-8 text-xs", className)} aria-label="Unidade">
        <SelectValue placeholder={line.unidade || "Unidade"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.isBase ? o.code : `${o.code} (${o.factor} ${base?.code ?? ""})`.replace(" )", ")")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface PackQuantityHintProps {
  qt: number | null | undefined;
  line: LineUomFields & { unidade?: string | null };
  baseCode: string | null | undefined;
  className?: string;
}

/** "2 × PK10 = 20 un", discreto, só quando a linha está numa embalagem. */
export function PackQuantityHint({ qt, line, baseCode, className }: PackQuantityHintProps) {
  const text = formatPackBreakdown(qt, line.unidade, getLineUnitsPerUom(line), baseCode);
  if (!text) return null;
  return <div className={cn("text-[10px] leading-tight text-muted-foreground whitespace-nowrap", className)}>{text}</div>;
}
