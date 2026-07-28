import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Loader2 } from "lucide-react";
import type { RuleGroup } from "./conditionCatalog";

export interface DryRunStagePayload {
  id: string;
  label: string;
  stage_order: number;
  reached_when: RuleGroup | null;
  matching_statuses: string[];
  counts_as_qualified: boolean;
  counts_as_negotiation: boolean;
  counts_as_converted: boolean;
  counts_as_lost: boolean;
}

interface SimulationResult {
  total_leads: number;
  before_totals: Record<string, number>;
  after_totals: Record<string, number>;
  changed_count: number;
  changed_examples: Array<{ lead_id: string; before: string; after: string }>;
}

interface DryRunPanelProps {
  companyId: string | null;
  stages: DryRunStagePayload[];
}

/**
 * Fase 3 §3 — calls simulate_lead_v2_bucket_changes (read-only, see
 * migration 20261110540000) against the currently-edited (not yet saved)
 * stage list, and renders before/after bucket totals + up to 20 examples.
 */
export function DryRunPanel({ companyId, stages }: DryRunPanelProps) {
  const { toast } = useToast();
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSimulate = async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("simulate_lead_v2_bucket_changes", {
      p_org: companyId,
      p_stages: stages,
    });
    setLoading(false);

    if (error) {
      toast({ title: "Erro ao simular impacto", description: error.message, variant: "destructive" });
      return;
    }
    setResult(data as SimulationResult);
  };

  const buckets = Array.from(
    new Set([
      ...Object.keys(result?.before_totals ?? {}),
      ...Object.keys(result?.after_totals ?? {}),
    ])
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Calcula quantas leads mudariam de bucket com as regras atuais — sem gravar.
      </p>
      <Button variant="outline" onClick={handleSimulate} disabled={loading || !companyId}>
        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        Simular impacto
      </Button>

      {result && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <p className="text-sm">
              <strong>{result.total_leads}</strong> leads avaliadas ·{" "}
              <strong>{result.changed_count}</strong> mudariam de bucket
            </p>

            <div className="space-y-1">
              {buckets.map(bucket => {
                const before = result.before_totals[bucket] ?? 0;
                const after = result.after_totals[bucket] ?? 0;
                return (
                  <div key={bucket} className="flex items-center gap-2 text-sm">
                    <span className="w-32 shrink-0 capitalize">{bucket}</span>
                    <span>{before}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className={after !== before ? "font-semibold" : ""}>{after}</span>
                  </div>
                );
              })}
            </div>

            {result.changed_examples.length > 0 && (
              <div className="space-y-1 pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  Exemplos ({result.changed_examples.length}{result.changed_count > result.changed_examples.length ? ` de ${result.changed_count}` : ""}):
                </p>
                {result.changed_examples.map(example => (
                  <div key={example.lead_id} className="flex items-center gap-2 text-xs">
                    <Badge variant="outline">{example.before}</Badge>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <Badge variant="outline">{example.after}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
