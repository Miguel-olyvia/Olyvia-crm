import { Label } from "@/components/ui/label";
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

const BUCKET_OPTIONS: Array<{ value: RuleBucket; label: string }> = [
  { value: "none", label: "Nenhuma" },
  { value: "all", label: "Obrigatória" },
  { value: "any", label: "Qualquer" },
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
    <div className="space-y-2">
      {requiredCount > 0 && anyCount > 0 && (
        <p className="text-xs text-muted-foreground">
          Alcançada quando <strong>todas</strong> as obrigatórias e <strong>pelo menos uma</strong> das "qualquer" forem verdadeiras.
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
                  <button
                    key={opt.value}
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
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
