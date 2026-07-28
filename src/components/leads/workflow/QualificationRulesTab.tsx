import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { StageRulesEditor } from "./StageRulesEditor";
import type { RuleGroup } from "./conditionCatalog";
import { useLeadPipelineRules } from "@/hooks/useLeadPipelineRules";

interface QualificationRulesTabProps {
  companyId: string | null;
}

/**
 * Fase 3 §2 — org-level MQL/SQL suggestion rules (lead_qualification_rules,
 * one row per organization_id, see migration 20261110490000). Manual
 * classification on the lead itself (anew_leads.qualification_type, set via
 * AnewLeadEditDialog) always wins over this suggestion - these rules only
 * feed the "qualification_is" condition inside stage_reached().
 *
 * Fetching goes through useLeadPipelineRules so a save here immediately
 * invalidates/refetches the same org-scoped cache consumed by
 * LeadWorkflowConfig.tsx (and vice-versa).
 */
export function QualificationRulesTab({ companyId }: QualificationRulesTabProps) {
  const { toast } = useToast();
  const { qualificationRules, isLoading, invalidate } = useLeadPipelineRules(companyId);
  const [mqlWhen, setMqlWhen] = useState<RuleGroup | null>(null);
  const [sqlWhen, setSqlWhen] = useState<RuleGroup | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMqlWhen(qualificationRules?.mql_when ?? null);
    setSqlWhen(qualificationRules?.sql_when ?? null);
  }, [qualificationRules]);

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    const { error } = await (supabase as any)
      .from("lead_qualification_rules")
      .upsert(
        { organization_id: companyId, mql_when: mqlWhen, sql_when: sqlWhen },
        { onConflict: "organization_id" }
      );
    setSaving(false);

    if (error) {
      toast({ title: "Erro ao gravar regras de qualificação", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Regras de qualificação guardadas" });
      invalidate();
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">A carregar...</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Estas regras sugerem quando uma lead deve passar a MQL ou SQL. A classificação manual
        feita directamente na lead tem sempre prioridade sobre esta sugestão.
      </p>

      <Card className="bg-orange-500/5 border-orange-500/20">
        <CardContent className="py-4 space-y-3">
          <div className="space-y-1">
            <Label className="text-sm font-medium text-orange-700 dark:text-orange-400">
              Quando uma lead é MQL
            </Label>
            <p className="text-xs text-muted-foreground">
              Sinais que indicam interesse qualificado por Marketing.
            </p>
          </div>
          <StageRulesEditor value={mqlWhen} onChange={setMqlWhen} organizationId={companyId} compact />
        </CardContent>
      </Card>

      <Card className="bg-emerald-500/5 border-emerald-500/20">
        <CardContent className="py-4 space-y-3">
          <div className="space-y-1">
            <Label className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              Quando uma lead é SQL
            </Label>
            <p className="text-xs text-muted-foreground">
              Sinais que indicam que Vendas pode avançar com proposta.
            </p>
          </div>
          <StageRulesEditor value={sqlWhen} onChange={setSqlWhen} organizationId={companyId} compact />
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? "A gravar..." : "Guardar regras de qualificação"}
      </Button>
    </div>
  );
}
