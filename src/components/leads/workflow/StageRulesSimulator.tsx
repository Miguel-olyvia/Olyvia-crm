import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Loader2, Eye } from "lucide-react";
import type { RuleGroup } from "./conditionCatalog";

export interface StageRulesDraft {
  id: string;
  matching_statuses: string[];
  reached_when: RuleGroup | null;
  auto_advance: boolean;
  qualification_hint: "none" | "mql" | "sql";
  counts_as_converted: boolean;
  counts_as_lost: boolean;
  counts_as_qualified: boolean;
  counts_as_negotiation: boolean;
}

interface StageRuleSimulationResult {
  total_leads: number;
  stage_match_count_before: number;
  stage_match_count_after: number;
  before_totals: Record<string, number>;
  after_totals: Record<string, number>;
}

interface StageRulesSimulatorProps {
  companyId: string | null;
  stage: StageRulesDraft;
}

const BUCKET_LABELS: Record<string, string> = {
  qualified: "Qualificados",
  negotiation: "Em Negociação",
  converted: "Convertidos",
  lost: "Perdidos",
};

/**
 * "Pré-visualizar impacto" — calls simulate_lead_workflow_stage_rules
 * (migration 20261111040000) with the currently-edited (not yet saved)
 * rule fields for ONE stage. Every other stage's stored rules are left
 * untouched by the RPC. Read-only: never writes anew_leads or
 * lead_workflow_stages. Only runs when the button is clicked, never on
 * every keystroke.
 */
export function StageRulesSimulator({ companyId, stage }: StageRulesSimulatorProps) {
  const { toast } = useToast();
  const [result, setResult] = useState<StageRuleSimulationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSimulate = async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("simulate_lead_workflow_stage_rules", {
      p_org_id: companyId,
      p_stage_id: stage.id,
      p_matching_statuses: stage.matching_statuses,
      p_reached_when: stage.reached_when,
      p_auto_advance: stage.auto_advance,
      p_qualification_hint: stage.qualification_hint,
      p_counts_as_converted: stage.counts_as_converted,
      p_counts_as_lost: stage.counts_as_lost,
      p_counts_as_qualified: stage.counts_as_qualified,
      p_counts_as_negotiation: stage.counts_as_negotiation,
    });
    setLoading(false);

    if (error) {
      toast({ title: "Erro ao pré-visualizar impacto", description: error.message, variant: "destructive" });
      return;
    }
    setResult(data as StageRuleSimulationResult);
  };

  const buckets = Array.from(
    new Set([
      ...Object.keys(result?.before_totals ?? {}),
      ...Object.keys(result?.after_totals ?? {}),
    ])
  );

  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" size="sm" onClick={handleSimulate} disabled={loading || !companyId}>
        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
        Pré-visualizar impacto
      </Button>

      {result && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <p className="text-sm">
              <strong>{result.stage_match_count_after}</strong> leads passariam a estar nesta etapa
              {" "}(hoje: <strong>{result.stage_match_count_before}</strong>)
            </p>

            <div className="space-y-1">
              {buckets.map(bucket => {
                const before = result.before_totals[bucket] ?? 0;
                const after = result.after_totals[bucket] ?? 0;
                return (
                  <div key={bucket} className="flex items-center gap-2 text-sm">
                    <span className="w-32 shrink-0">{BUCKET_LABELS[bucket] ?? bucket}</span>
                    <span>{before}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className={after !== before ? "font-semibold" : ""}>{after}</span>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground pt-2 border-t">
              Avaliado contra {result.total_leads} leads ativas da organização. Nada é gravado nesta pré-visualização.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
