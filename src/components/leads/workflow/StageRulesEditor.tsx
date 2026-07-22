import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  bucketForRow,
  CONDITION_CATALOG,
  setBucketForRow,
  type RuleBucket,
  type RuleGroup,
} from "./conditionCatalog";

interface StageRulesEditorProps {
  value: RuleGroup | null;
  onChange: (value: RuleGroup | null) => void;
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
 * list of the 12 available conditions, each with an independent 3-way
 * toggle: Nenhuma / Obrigatória (goes into the "all" bucket) / Qualquer
 * (goes into "any").
 */
export function StageRulesEditor({ value, onChange }: StageRulesEditorProps) {
  const requiredCount = value?.all.length ?? 0;
  const anyCount = value?.any.length ?? 0;

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
          {CONDITION_CATALOG.map(row => {
            const bucket = bucketForRow(value, row);

            return (
              <div key={row.key} className="flex items-center justify-between gap-2 p-2">
                <Label className="text-sm font-normal">{row.label}</Label>
                <div className="flex items-center rounded-md border overflow-hidden shrink-0">
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
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
