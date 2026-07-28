import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useLeadContactResults } from "@/hooks/useLeadContactResults";
import {
  buildContactResultCatalogRows,
  CONDITION_CATALOG,
  isRowInBucket,
  conditionForRowInBucket,
  setNumericValueInBucket,
  setRowInBucket,
  type CatalogRow,
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

const COLUMNS: Array<{ bucket: "all" | "any"; title: string; tooltip: string }> = [
  {
    bucket: "all",
    title: "Todas (AND)",
    tooltip: "Tem de ser verdadeira. Se marcares várias nesta coluna, TODAS têm de ser verdadeiras ao mesmo tempo.",
  },
  {
    bucket: "any",
    title: "Qualquer (OU)",
    tooltip: "Basta que UMA das condições marcadas nesta coluna seja verdadeira — não precisam de ser todas.",
  },
];

/**
 * Reusable condition-list builder for reached_when (per stage) and
 * mql_when/sql_when (org-level qualification rules). Mirrors the reference
 * Lovable layout: two independent checkbox columns side by side - "Todas
 * (AND)" and "Qualquer (OU)" - each listing every available signal (see
 * CONDITION_CATALOG). A signal can be checked in both columns at once (it
 * then contributes to both the "all" and "any" arrays), in just one, or in
 * neither. Rows with a numeric parameter (the "days since" conditions) show
 * a small number input once checked, tracked independently per column.
 */
export function StageRulesEditor({ value, onChange, organizationId }: StageRulesEditorProps) {
  const { contactResults } = useLeadContactResults(organizationId);
  const contactResultRows = buildContactResultCatalogRows(contactResults);

  const renderRow = (row: CatalogRow, bucket: "all" | "any") => {
    const checked = isRowInBucket(value, row, bucket);
    const condition = conditionForRowInBucket(value, row, bucket);
    const numericValue = row.numericParam
      ? row.numericParam.getValue(condition ?? row.build())
      : undefined;
    const inputId = `stage-rule-${bucket}-${row.key}`;

    return (
      <div key={row.key} className="flex items-center justify-between gap-2 p-2">
        <div className="flex items-center gap-2 min-w-0">
          <Checkbox
            id={inputId}
            checked={checked}
            onCheckedChange={isChecked => onChange(setRowInBucket(value, row, bucket, isChecked === true))}
          />
          <Label htmlFor={inputId} className="text-sm font-normal cursor-pointer truncate">
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
        </div>
        {row.numericParam && checked && (
          <input
            type="number"
            min={1}
            value={numericValue}
            onChange={e => {
              const parsed = Number.parseInt(e.target.value, 10);
              const nextValue = Number.isNaN(parsed) ? row.numericParam!.defaultValue : parsed;
              onChange(setNumericValueInBucket(value, row, bucket, nextValue));
            }}
            className="w-14 shrink-0 rounded-md border bg-background px-1.5 py-1 text-xs"
            aria-label={`Número de dias para "${row.label}" (${bucket === "all" ? "AND" : "OR"})`}
          />
        )}
      </div>
    );
  };

  const renderColumn = (bucket: "all" | "any", title: string, tooltip: string) => (
    <div className="flex-1 min-w-0 rounded-md border">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="border-b bg-muted/50 px-3 py-2 text-xs font-semibold cursor-help">
            {title}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>

      <div className="divide-y">
        {CONDITION_CATALOG.map(row => renderRow(row, bucket))}
      </div>

      {contactResultRows.length > 0 && (
        <div className="space-y-1 border-t p-2">
          <Label className="text-xs font-medium text-muted-foreground">
            Último resultado de contacto
          </Label>
          <div className="max-h-40 overflow-y-auto rounded-md border divide-y">
            {contactResultRows.map(row => renderRow(row, bucket))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <div className={cn("flex flex-col gap-3 md:flex-row")}>
          {COLUMNS.map(col => renderColumn(col.bucket, col.title, col.tooltip))}
        </div>
      </div>
    </TooltipProvider>
  );
}
