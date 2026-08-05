import { useState } from "react";
import { Sparkles, Target, TrendingUp, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { withAuditContext } from "@/utils/auditContext";
import { useToast } from "@/hooks/use-toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type QualificationType = "mql" | "sql";
type QualificationHint = "none" | "mql" | "sql" | null | undefined;

interface LeadQualificationCardProps {
  // `any` kept intentionally: mirrors the raw selectedLead row shape used
  // throughout AnewLeads.tsx (see LeadJourneyTab's own justification).
  lead: any;
  qualificationHint: QualificationHint;
  userId: string;
  onQualificationUpdated?: (qualificationType: QualificationType) => void;
}

const QUALIFICATION_COPY: Record<QualificationType, { title: string; description: string }> = {
  mql: {
    title: "MQL — Marketing Qualified Lead",
    description: "Demonstrou interesse (formulário, download, pedido de info) mas ainda não está pronto para comprar. Precisa de nutrição antes de passar ao comercial.",
  },
  sql: {
    title: "SQL — Sales Qualified Lead",
    description: "Já validada pelo comercial: tem intenção, orçamento e timing para avançar. Pronta para receber proposta.",
  },
};

export function LeadQualificationCard({
  lead, qualificationHint, userId, onQualificationUpdated,
}: LeadQualificationCardProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState<QualificationType | null>(null);
  const [localOverride, setLocalOverride] = useState<QualificationType | null>(null);

  const confirmedType: QualificationType | null =
    localOverride ?? (lead.qualification_type === "mql" || lead.qualification_type === "sql" ? lead.qualification_type : null);

  const handleClassify = async (type: QualificationType) => {
    if (!lead?.id || saving) return;
    setSaving(type);
    try {
      await withAuditContext(supabase, userId, async () => {
        const { error } = await supabase.rpc("rpc_update_lead", {
          p_lead_id: lead.id,
          p_field_values: lead.field_values ?? {},
          p_status: lead.status,
          p_source: lead.source ?? null,
          p_notes: lead.notes ?? null,
          p_assigned_to: lead.assigned_to ?? null,
          p_status_changed: false,
          p_workflow_stage_id: null,
          p_display_name: null,
          p_first_name: null,
          p_last_name: null,
          p_qualification_type: type,
          p_qualification_changed: true,
        });

        if (error) throw error;
      });

      setLocalOverride(type);
      onQualificationUpdated?.(type);
      toast({
        title: "Qualificação atualizada",
        description: `Lead classificada como ${type.toUpperCase()}.`,
      });
    } catch (error) {
      const description = await getFriendlyErrorMessage(error);
      toast({
        title: "Erro ao classificar lead",
        description,
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  if (confirmedType) {
    return (
      <Card>
        <CardContent className="py-4 px-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-4.5 w-4.5 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              Qualificação comercial
              <Badge variant="outline" className="text-[10px]">{confirmedType.toUpperCase()}</Badge>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{QUALIFICATION_COPY[confirmedType].description}</p>
          </div>
          {confirmedType === "mql" && (
            <Button
              size="sm"
              className="h-7 px-2 text-[11px] shrink-0"
              disabled={saving !== null}
              onClick={() => handleClassify("sql")}
            >
              {saving === "sql" ? "A promover..." : "Promover a SQL"}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const suggested: QualificationType | null =
    qualificationHint === "mql" || qualificationHint === "sql" ? qualificationHint : null;

  return (
    <Card>
      <CardContent className="py-4 px-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            Qualificação comercial
          </h4>
          <div className="flex items-center gap-1.5">
            {(["mql", "sql"] as const).map((type) => (
              <Button
                key={type}
                size="sm"
                variant={suggested === type ? "default" : "outline"}
                className="h-7 px-2 text-[11px]"
                disabled={saving !== null}
                onClick={() => handleClassify(type)}
              >
                {saving === type ? "A classificar..." : type.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          Marca como <strong>MQL</strong> quando o interesse está demonstrado (ex.: visita agendada). Promove a{" "}
          <strong>SQL</strong> quando estiver pronta para receber proposta.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(["mql", "sql"] as const).map((type) => {
            const isSuggested = suggested === type;
            const Icon = type === "sql" ? TrendingUp : Target;
            return (
              <div
                key={type}
                className={`rounded-md border p-3 space-y-2 ${
                  isSuggested ? "border-purple-300 dark:border-purple-700 bg-purple-500/5" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    {type.toUpperCase()}
                  </span>
                  {isSuggested && (
                    <Badge className="text-[9px] bg-purple-500 hover:bg-purple-500">SUGERIDO</Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {QUALIFICATION_COPY[type].description}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
