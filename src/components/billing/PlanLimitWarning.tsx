import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { usePlanUsage, type PlanUsageLimit } from "@/hooks/usePlanUsage";
import { useTranslation } from "@/hooks/useTranslation";

interface PlanLimitWarningProps {
  organizationId: string | null | undefined;
  limitType: PlanUsageLimit["limit_type"];
  /** Fraction (0-1) at which the warning starts showing. Default 0.8. */
  threshold?: number;
}

const LABEL_KEY_BY_TYPE: Record<PlanUsageLimit["limit_type"], string> = {
  ai_credits: "planLimitWarning.label.aiCredits",
  leads: "planLimitWarning.label.leads",
  users: "planLimitWarning.label.users",
  proposals: "planLimitWarning.label.proposals",
  quotes: "planLimitWarning.label.quotes",
  contracts: "planLimitWarning.label.contracts",
};

/**
 * Shows nothing until usage crosses `threshold` (default 80%) of the
 * plan's ceiling for `limitType`, then an amber banner with a progress
 * bar; at/over the ceiling it switches to the same red tone the blocked
 * toast uses, so a user sees the wall coming before they actually hit it
 * (fn_check_and_consume_*/the anew_leads-anew_clients-proposals-quotes-
 * client_contracts triggers) — see usePlanUsage for how the numbers are
 * sourced.
 *
 * Renders nothing for a NULL limit_value (unlimited plan/limit_type) or
 * while the read hasn't resolved yet — never a loading skeleton, since
 * this is a secondary warning, not primary page content.
 */
export function PlanLimitWarning({ organizationId, limitType, threshold = 0.8 }: PlanLimitWarningProps) {
  const { getLimit } = usePlanUsage(organizationId);
  const { t } = useTranslation();

  const limit = getLimit(limitType);
  if (!limit || limit.limit_value === null || limit.limit_value <= 0) return null;

  const ratio = limit.used_value / limit.limit_value;
  if (ratio < threshold) return null;

  const reached = limit.used_value >= limit.limit_value;
  const label = t(LABEL_KEY_BY_TYPE[limitType]);

  return (
    <Alert variant={reached ? "destructive" : "default"} className={reached ? undefined : "border-amber-500 text-amber-700 dark:text-amber-400 dark:border-amber-500"}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>
        {reached
          ? t('planLimitWarning.reachedTitle')
          : t('planLimitWarning.approachingTitle')}
      </AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          {t('planLimitWarning.body', {
            used: limit.used_value,
            limit: limit.limit_value,
            label,
          })}
        </p>
        <Progress value={Math.min(ratio, 1) * 100} className="h-1.5" />
      </AlertDescription>
    </Alert>
  );
}
