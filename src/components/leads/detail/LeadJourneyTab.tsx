import { useEffect, useState } from "react";
import { differenceInDays } from "date-fns";
import { Check, Star, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LeadQualificationCard } from "./LeadQualificationCard";

interface LeadStage {
  id: string;
  label: string;
  color: string | null;
  stage_order: number;
  qualification_hint: "none" | "mql" | "sql" | null;
  counts_as_qualified: boolean;
  counts_as_negotiation: boolean;
  counts_as_converted: boolean;
  counts_as_lost: boolean;
}

interface ResolvedStageResponse {
  resolved_stage_id: string | null;
  resolved_stage: LeadStage | null;
  stages: LeadStage[];
  is_lost: boolean;
  furthest_progress_stage_id: string | null;
  furthest_progress_stage: LeadStage | null;
}

interface LeadJourneyTabProps {
  // `any` kept intentionally: this prop is the raw selectedLead row from
  // AnewLeads.tsx, which already carries qualification_type/qualified_at
  // (see LEADS_LIST_COLUMNS) — no separate shared Lead interface exists to
  // extend here.
  lead: any;
  hasClient: boolean;
  clientCreatedAt: string | null;
  interactionCount: number;
  dealCount: number;
  dealValue: number;
  // Used only to key the resolved-stage fetch defensively; the RPC itself
  // only needs the lead id.
  organizationId?: string | null;
  userId?: string;
}

export function LeadJourneyTab({
  lead, hasClient, clientCreatedAt,
  interactionCount, dealCount, dealValue,
  organizationId, userId,
}: LeadJourneyTabProps) {
  const [resolvedStages, setResolvedStages] = useState<ResolvedStageResponse | null>(null);
  const [stagesLoading, setStagesLoading] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    if (!lead?.id) {
      setResolvedStages(null);
      return;
    }

    setStagesLoading(true);
    supabase
      .rpc("get_lead_journey_stage", { p_lead_id: lead.id })
      .then(({ data, error }) => {
        if (isCancelled) return;
        if (error) {
          // Old leads / edge cases should never break this tab — fall back
          // to no dynamic stepper data rather than surfacing the error.
          setResolvedStages(null);
          return;
        }
        setResolvedStages((data as ResolvedStageResponse) ?? null);
      })
      .finally(() => {
        if (!isCancelled) setStagesLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [lead?.id, organizationId]);

  const isNegotiatingOrLater = lead.status === "negotiation" || lead.status === "converted";

  const stages = resolvedStages?.stages ?? [];
  const isLost = resolvedStages?.is_lost === true;
  // For a lost/rejected lead, the fill threshold is the furthest genuinely
  // reached stage (reconstructed from audit history), not the rejection
  // stage's own order — otherwise every stage would render as "completed"
  // simply because the rejection stage always has the highest stage_order.
  const fillThresholdOrder = isLost
    ? resolvedStages?.furthest_progress_stage?.stage_order ?? null
    : resolvedStages?.resolved_stage?.stage_order ?? null;

  const steps = stages.map((stage) => ({
    key: stage.id,
    label: stage.label,
    color: stage.color,
    completed:
      fillThresholdOrder !== null &&
      stage.stage_order <= fillThresholdOrder &&
      stage.id !== resolvedStages?.resolved_stage_id,
    current: stage.id === resolvedStages?.resolved_stage_id,
  }));

  const leadToContactDays = isNegotiatingOrLater
    ? differenceInDays(new Date(lead.updated_at), new Date(lead.created_at))
    : null;

  return (
    <div className="space-y-6 mt-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
        🗺 Percurso
      </h3>

      {/* Journey visualization */}
      {stagesLoading ? (
        <div className="flex items-center justify-between px-4 animate-pulse">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className="h-10 w-10 rounded-full bg-muted border-2 border-muted-foreground/20" />
                <div className="h-2.5 w-12 mt-1.5 rounded bg-muted" />
              </div>
              {i < 3 && <div className="flex-1 h-0.5 mx-2 bg-muted-foreground/10" />}
            </div>
          ))}
        </div>
      ) : steps.length > 0 ? (
        <div className="flex items-center justify-between px-4">
          {steps.map((step, i) => (
            <div key={step.key} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center border-2 ${
                  step.current ? "bg-purple-500 border-purple-500 text-white" :
                  step.completed ? "bg-green-500 border-green-500 text-white" :
                  "bg-muted border-muted-foreground/30 text-muted-foreground"
                }`}>
                  {step.current ? <Star className="h-5 w-5" /> :
                   step.completed ? <Check className="h-5 w-5" /> :
                   <HelpCircle className="h-5 w-5" />}
                </div>
                <p className={`text-xs mt-1.5 font-medium text-center ${
                  step.current ? "text-purple-600 dark:text-purple-400" :
                  step.completed ? "text-foreground" : "text-muted-foreground"
                }`}>
                  {step.label}
                </p>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${
                  steps[i + 1].completed || steps[i + 1].current ? "bg-green-500" : "bg-muted-foreground/20"
                }`} />
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* Qualification suggestion / confirmation */}
      <LeadQualificationCard
        lead={lead}
        qualificationHint={resolvedStages?.resolved_stage?.qualification_hint ?? null}
        userId={userId ?? ""}
      />

      {/* Summary */}
      {(leadToContactDays !== null || interactionCount > 0 || dealCount > 0) && (
        <div className="rounded-lg bg-gradient-to-r from-primary/5 to-purple-500/5 border p-4 text-center">
          <p className="text-sm text-muted-foreground">
            {leadToContactDays !== null && (
              <><strong className="text-foreground">{leadToContactDays} dias</strong> de Lead a Negociação · </>
            )}
            <strong className="text-foreground">{interactionCount} interacções</strong> registadas
            {dealCount > 0 && (
              <> · <strong className="text-foreground">{dealCount} deals</strong> no valor de <strong className="text-foreground">€{dealValue.toLocaleString("pt-PT")}</strong></>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
