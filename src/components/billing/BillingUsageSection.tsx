import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { usePlanUsage, type PlanUsageLimit } from "@/hooks/usePlanUsage";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

const P = "billing.page.usage.";

const LIMIT_ORDER: Array<{ type: PlanUsageLimit["limit_type"]; labelKey: string }> = [
  { type: "ai_credits", labelKey: "planLimitWarning.label.aiCredits" },
  { type: "leads", labelKey: "planLimitWarning.label.leads" },
  { type: "users", labelKey: "planLimitWarning.label.users" },
  { type: "proposals", labelKey: "planLimitWarning.label.proposals" },
  { type: "quotes", labelKey: "planLimitWarning.label.quotes" },
  { type: "contracts", labelKey: "planLimitWarning.label.contracts" },
];

interface BillingUsageSectionProps {
  organizationId: string;
}

/** Usage against every plan limit, read through fn_get_plan_usage_summary (server resolves the payer and the month). */
export function BillingUsageSection({ organizationId }: BillingUsageSectionProps) {
  const { t } = useTranslation();
  const { getLimit, loading, error, summary, refetch } = usePlanUsage(organizationId);

  return (
    <section aria-labelledby="billing-usage-title" aria-busy={loading} className="space-y-3">
      <h2 id="billing-usage-title" className="text-lg font-semibold">
        {t(`${P}title`)}
      </h2>
      <p className="text-sm text-muted-foreground">{t(`${P}description`)}</p>

      {error && (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300">
          <p>{t(`${P}loadError`)}</p>
          <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={loading}>
            {t("settingsPage.billing.retry")}
          </Button>
        </div>
      )}

      {loading && !summary && !error && (
        <Loader2 role="status" aria-label={t("settingsPage.billing.loading")} className="h-5 w-5 animate-spin" />
      )}

      {summary && !error && (
        <ul className="space-y-4">
          {LIMIT_ORDER.map(({ type, labelKey }) => {
            const limit = getLimit(type);
            if (!limit) return null;
            const label = t(labelKey);
            const unlimited = limit.limit_value === null || limit.limit_value === undefined;
            const used = limit.used_value ?? 0;
            const percent = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit.limit_value as number)) * 100));
            const cadence = limit.reset_cadence === "monthly" ? t(`${P}monthly`) : t(`${P}total`);
            return (
              <li key={type} data-testid={`usage-${type}`} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium capitalize">{label}</span>
                  <span className="text-muted-foreground">
                    {unlimited
                      ? `${used} · ${t(`${P}unlimited`)}`
                      : `${used} / ${limit.limit_value}`}
                    <span className="ml-2 text-xs">({cadence})</span>
                  </span>
                </div>
                {!unlimited && (
                  <Progress
                    value={percent}
                    aria-label={`${label}: ${used} / ${limit.limit_value}`}
                    className={cn(
                      "h-2",
                      percent >= 100 && "[&>div]:bg-red-600",
                      percent >= 80 && percent < 100 && "[&>div]:bg-amber-500",
                    )}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default BillingUsageSection;
