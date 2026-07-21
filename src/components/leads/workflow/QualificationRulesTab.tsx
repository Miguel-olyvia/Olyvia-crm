import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { StageRulesEditor } from "./StageRulesEditor";
import type { RuleGroup } from "./conditionCatalog";

interface QualificationRulesTabProps {
  companyId: string | null;
}

/**
 * Fase 3 §2 — org-level MQL/SQL suggestion rules (lead_qualification_rules,
 * one row per organization_id, see migration 20261110490000). Manual
 * classification on the lead itself (anew_leads.qualification_type, set via
 * AnewLeadEditDialog) always wins over this suggestion - these rules only
 * feed the "qualification_is" condition inside stage_reached().
 */
export function QualificationRulesTab({ companyId }: QualificationRulesTabProps) {
  const { toast } = useToast();
  const [mqlWhen, setMqlWhen] = useState<RuleGroup | null>(null);
  const [sqlWhen, setSqlWhen] = useState<RuleGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    (supabase as any)
      .from("lead_qualification_rules")
      .select("mql_when, sql_when")
      .eq("organization_id", companyId)
      .maybeSingle()
      .then(({ data }: any) => {
        setMqlWhen(data?.mql_when ?? null);
        setSqlWhen(data?.sql_when ?? null);
        setLoading(false);
      });
  }, [companyId]);

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
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">A carregar...</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Estas regras sugerem quando uma lead deve passar a MQL ou SQL. A classificação manual
        feita directamente na lead tem sempre prioridade sobre esta sugestão.
      </p>

      <Card>
        <CardContent className="py-4 space-y-3">
          <Label className="text-sm font-medium">Condições para MQL</Label>
          <StageRulesEditor value={mqlWhen} onChange={setMqlWhen} companyId={companyId} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4 space-y-3">
          <Label className="text-sm font-medium">Condições para SQL</Label>
          <StageRulesEditor value={sqlWhen} onChange={setSqlWhen} companyId={companyId} />
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? "A gravar..." : "Guardar regras de qualificação"}
      </Button>
    </div>
  );
}
