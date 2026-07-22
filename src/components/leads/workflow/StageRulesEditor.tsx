import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEAD_STATUS_OPTIONS } from "@/components/leads/LeadWorkflowConfig";
import {
  bucketForRow,
  CONDITION_CATALOG,
  conditionForRow,
  setBucketForRow,
  updateConditionForRow,
  type ContactResultOption,
  type RuleBucket,
  type RuleGroup,
} from "./conditionCatalog";

interface StageRulesEditorProps {
  value: RuleGroup | null;
  onChange: (value: RuleGroup | null) => void;
  companyId: string | null;
}

const BUCKET_OPTIONS: Array<{ value: RuleBucket; label: string }> = [
  { value: "none", label: "Nenhuma" },
  { value: "all", label: "Obrigatória" },
  { value: "any", label: "Qualquer" },
];

/**
 * Reusable condition-list builder for reached_when (per stage) and
 * mql_when/sql_when (org-level qualification rules). Single scannable list
 * (like a checkbox grid) where each row independently picks a bucket -
 * Nenhuma / Obrigatória (all) / Qualquer (any) - instead of two separate
 * duplicated columns, so the same condition is never shown twice.
 *
 * Loads lead_contact_results (global templates + org-specific) so every
 * contact result an org has configured is selectable - no hardcoded
 * triggers_lost flag.
 */
export function StageRulesEditor({ value, onChange, companyId }: StageRulesEditorProps) {
  const [contactResults, setContactResults] = useState<ContactResultOption[]>([]);

  useEffect(() => {
    (supabase as any)
      .from("lead_contact_results")
      .select("id, name, organization_id")
      .eq("is_active", true)
      .or(companyId ? `organization_id.eq.${companyId},organization_id.is.null` : "organization_id.is.null")
      .order("sort_order")
      .then(({ data }: any) => {
        setContactResults((data ?? []).map((r: any) => ({ id: r.id, name: r.name })));
      });
  }, [companyId]);

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

      <div className="space-y-1 rounded-md border divide-y">
        {CONDITION_CATALOG.map(row => {
          const bucket = bucketForRow(value, row);
          const condition = conditionForRow(value, row);

          return (
            <div key={row.key} className="p-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
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
                      onClick={() => onChange(setBucketForRow(value, row, opt.value, contactResults[0]?.id))}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {bucket !== "none" && row.key === "status_in" && condition?.type === "status_in" && (
                <div className="flex flex-wrap gap-1">
                  {LEAD_STATUS_OPTIONS.map(opt => {
                    const selected = condition.values.includes(opt.value);
                    return (
                      <Badge
                        key={opt.value}
                        variant={selected ? "default" : "outline"}
                        className="cursor-pointer text-xs"
                        onClick={() =>
                          onChange(
                            updateConditionForRow(value, row, {
                              type: "status_in",
                              values: selected
                                ? condition.values.filter(v => v !== opt.value)
                                : [...condition.values, opt.value],
                            })
                          )
                        }
                      >
                        {opt.label}
                      </Badge>
                    );
                  })}
                </div>
              )}

              {bucket !== "none" && row.key === "last_contact_result" && condition?.type === "last_contact_result" && (
                <div className="flex items-center gap-2">
                  <Select
                    value={condition.is ? "is" : "is_not"}
                    onValueChange={(v: "is" | "is_not") =>
                      onChange(updateConditionForRow(value, row, { ...condition, is: v === "is" }))
                    }
                  >
                    <SelectTrigger className="h-8 w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="is">é</SelectItem>
                      <SelectItem value="is_not">não é</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={condition.result_id}
                    onValueChange={(v: string) => onChange(updateConditionForRow(value, row, { ...condition, result_id: v }))}
                  >
                    <SelectTrigger className="h-8 flex-1">
                      <SelectValue placeholder="Selecione o resultado" />
                    </SelectTrigger>
                    <SelectContent>
                      {contactResults.map(r => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
