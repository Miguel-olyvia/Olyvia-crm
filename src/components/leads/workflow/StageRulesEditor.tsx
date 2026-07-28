import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useLeadContactResults } from "@/hooks/useLeadContactResults";
import {
  bucketForRow,
  buildContactResultCatalogRows,
  conditionForRow,
  CONDITION_CATALOG,
  setBucketForRow,
  setNumericValueForRow,
  type CatalogRow,
  type RuleBucket,
  type RuleGroup,
} from "./conditionCatalog";

interface StageRulesEditorProps {
  value: RuleGroup | null;
  onChange: (value: RuleGroup | null) => void;
  /**
   * Scopes the "Último resultado de contacto" sub-list to this
   * organization's active lead_contact_results (global + own, see
   * useLeadContactResults.ts). Omit only for contexts with no org in scope
   * yet - the sub-list then falls back to global-only results.
   */
  organizationId?: string | null;
}

const BUCKET_OPTIONS: Array<{ value: RuleBucket; label: string; tooltip: string }> = [
  { value: "none", label: "Nenhuma", tooltip: "Não usar esta condição nesta regra." },
  {
    value: "all",
    label: "Obrigatória (E)",
    tooltip: "Tem de ser verdadeira. Se marcares várias como Obrigatória, TODAS têm de ser verdadeiras ao mesmo tempo.",
  },
  {
    value: "any",
    label: "Qualquer (OU)",
    tooltip: "Basta que UMA das condições marcadas como Qualquer seja verdadeira — não precisam de ser todas.",
  },
];

/**
 * Reusable condition-list builder for reached_when (per stage) and
 * mql_when/sql_when (org-level qualification rules). A single scannable
 * list of the available conditions (see CONDITION_CATALOG), each with an
 * independent 3-way toggle: Nenhuma / Obrigatória (goes into the "all"
 * bucket) / Qualquer (goes into "any"). Rows with a numeric parameter (the
 * "days since" conditions) additionally show a small number input once
 * selected.
 */
export function StageRulesEditor({ value, onChange, organizationId }: StageRulesEditorProps) {
  const requiredCount = value?.all.length ?? 0;
  const anyCount = value?.any.length ?? 0;
  const { contactResults } = useLeadContactResults(organizationId);
  const contactResultRows = buildContactResultCatalogRows(contactResults);

  const renderRow = (row: CatalogRow) => {
    const bucket = bucketForRow(value, row);
    const condition = conditionForRow(value, row);
    const numericValue = row.numericParam
      ? row.numericParam.getValue(condition ?? row.build())
      : undefined;

    return (
      <div key={row.key} className="flex items-center justify-between gap-2 p-2">
        <Label className="text-sm font-normal">
          {row.label}
          {row.approximate && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="ml-1 cursor-help text-muted-foreground">(aproximado)</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[260px] text-xs">
                Este sinal é uma aproximação: não existe um estado literal "concluído" para o
                levantamento de necessidades, pelo que se usa o orçamento associado ao deal do lead
                como proxy mais próximo.
              </TooltipContent>
            </Tooltip>
          )}
        </Label>
        <div className="flex items-center gap-2 shrink-0">
          {row.numericParam && bucket !== "none" && (
            <input
              type="number"
              min={1}
              value={numericValue}
              onChange={e => {
                const parsed = Number.parseInt(e.target.value, 10);
                const nextValue = Number.isNaN(parsed) ? row.numericParam!.defaultValue : parsed;
                onChange(setNumericValueForRow(value, row, nextValue));
              }}
              className="w-14 rounded-md border bg-background px-1.5 py-1 text-xs"
              aria-label={`Número de dias para "${row.label}"`}
            />
          )}
          <div className="flex items-center rounded-md border overflow-hidden">
            {BUCKET_OPTIONS.map(opt => (
              <Tooltip key={opt.value}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "px-2 py-1 text-xs transition-colors",
                      bucket === opt.value
                        ? opt.value === "all"
                          ? "bg-primary text-primary-foreground"
                          : opt.value === "any"
                            ? "bg-secondary text-secondary-foreground"
                            : "bg-muted text-muted-foreground"
                        : "hover:bg-muted"
                    )}
                    onClick={() => onChange(setBucketForRow(value, row, opt.value))}
                  >
                    {opt.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-xs">
                  {opt.tooltip}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground space-y-1">
          <p><strong>Obrigatória (E)</strong> — tem de ser verdadeira; se marcares várias, todas têm de o ser.</p>
          <p><strong>Qualquer (OU)</strong> — basta que uma das marcadas seja verdadeira.</p>
          <p>A regra fica: (todas as Obrigatórias) <strong>E</strong> (pelo menos uma Qualquer, se houver alguma marcada).</p>
        </div>

        {requiredCount > 0 && anyCount > 0 && (
          <p className="text-xs text-muted-foreground">
            Esta regra está activa: <strong>todas</strong> as obrigatórias e <strong>pelo menos uma</strong> das "qualquer" têm de ser verdadeiras.
          </p>
        )}
        {requiredCount === 0 && anyCount === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhuma condição seleccionada — alcançada apenas pelo status literal (ver abaixo).
          </p>
        )}

        <div className="rounded-md border divide-y">
          {CONDITION_CATALOG.map(renderRow)}
        </div>

        {contactResultRows.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">
              Último resultado de contacto
            </Label>
            <p className="text-xs text-muted-foreground">
              Compara o resultado do ÚLTIMO contacto registado na lead com um valor específico
              (os mesmos resultados configurados em Resultados de Contacto).
            </p>
            <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
              {contactResultRows.map(renderRow)}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
