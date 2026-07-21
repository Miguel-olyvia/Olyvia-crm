import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { LEAD_STATUS_OPTIONS } from "@/components/leads/LeadWorkflowConfig";
import {
  CONDITION_CATALOG,
  defaultConditionForType,
  type ContactResultOption,
  type RuleCondition,
  type RuleConditionType,
  type RuleGroup,
} from "./conditionCatalog";

interface StageRulesEditorProps {
  value: RuleGroup | null;
  onChange: (value: RuleGroup | null) => void;
  companyId: string | null;
}

/**
 * Reusable AND/OR condition-block builder for reached_when (per stage) and
 * mql_when/sql_when (org-level qualification rules) - same shape, same
 * catalog, per the Fase 3 spec ("usando o mesmo builder de blocos acima").
 *
 * Loads lead_contact_results (global templates + org-specific) so every
 * contact result an org has configured is selectable as a
 * "last_contact_result" condition - no hardcoded triggers_lost flag.
 */
export function StageRulesEditor({ value, onChange, companyId }: StageRulesEditorProps) {
  const conditions = value?.conditions ?? [];
  const op = value?.op ?? "AND";
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

  const updateConditions = (next: RuleCondition[]) => {
    if (next.length === 0) {
      onChange(null);
      return;
    }
    onChange({ op, conditions: next });
  };

  const addCondition = (type: RuleConditionType) => {
    updateConditions([...conditions, defaultConditionForType(type, contactResults[0]?.id)]);
  };

  const removeCondition = (index: number) => {
    updateConditions(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, next: RuleCondition) => {
    updateConditions(conditions.map((c, i) => (i === index ? next : c)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label className="text-sm">Combinar condições com:</Label>
        <Select
          value={op}
          onValueChange={(v: "AND" | "OR") => onChange(conditions.length === 0 ? null : { op: v, conditions })}
        >
          <SelectTrigger className="w-28 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AND">E (todas)</SelectItem>
            <SelectItem value="OR">OU (qualquer)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {conditions.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sem condições — a etapa é alcançada apenas pelo status literal (ver abaixo).
        </p>
      ) : (
        <div className="space-y-2">
          {conditions.map((condition, index) => (
            <div key={index} className="flex items-start gap-2 rounded-md border p-2">
              <div className="flex-1 space-y-2">
                <Select
                  value={condition.type}
                  onValueChange={(v: RuleConditionType) => updateCondition(index, defaultConditionForType(v, contactResults[0]?.id))}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_CATALOG.map(entry => (
                      <SelectItem key={entry.type} value={entry.type}>{entry.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {condition.type === "status_in" && (
                  <div className="flex flex-wrap gap-1">
                    {LEAD_STATUS_OPTIONS.map(opt => {
                      const selected = condition.values.includes(opt.value);
                      return (
                        <Badge
                          key={opt.value}
                          variant={selected ? "default" : "outline"}
                          className="cursor-pointer text-xs"
                          onClick={() =>
                            updateCondition(index, {
                              type: "status_in",
                              values: selected
                                ? condition.values.filter(v => v !== opt.value)
                                : [...condition.values, opt.value],
                            })
                          }
                        >
                          {opt.label}
                        </Badge>
                      );
                    })}
                  </div>
                )}

                {condition.type === "qualification_is" && (
                  <Select
                    value={condition.value}
                    onValueChange={(v: "mql" | "sql") => updateCondition(index, { type: "qualification_is", value: v })}
                  >
                    <SelectTrigger className="h-8 w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mql">MQL</SelectItem>
                      <SelectItem value="sql">SQL</SelectItem>
                    </SelectContent>
                  </Select>
                )}

                {condition.type === "last_contact_result" && (
                  <div className="flex items-center gap-2">
                    <Select
                      value={condition.is ? "is" : "is_not"}
                      onValueChange={(v: "is" | "is_not") => updateCondition(index, { ...condition, is: v === "is" })}
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
                      onValueChange={(v: string) => updateCondition(index, { ...condition, result_id: v })}
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
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeCondition(index)}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Select onValueChange={(v: RuleConditionType) => addCondition(v)} value="">
        <SelectTrigger className="h-8 w-fit gap-1.5 text-xs">
          <Plus className="w-3.5 h-3.5" />
          <SelectValue placeholder="Adicionar condição" />
        </SelectTrigger>
        <SelectContent>
          {CONDITION_CATALOG.map(entry => (
            <SelectItem key={entry.type} value={entry.type}>{entry.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
