import { Link } from "react-router-dom";
import { CreditCard } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBillingOverview } from "@/hooks/useBillingOverview";
import { useTranslation } from "@/hooks/useTranslation";
import { normalizeStatus } from "@/components/billing/billingUtils";

const P = "billing.page.";

interface BillingSummaryCardProps {
  organizationId: string | null;
}

/** Small plan + status summary for Settings, linking to the full billing page. */
export function BillingSummaryCard({ organizationId }: BillingSummaryCardProps) {
  const { t } = useTranslation();
  const { overview, loading, errorKey } = useBillingOverview(organizationId);

  return (
    <Card aria-busy={loading}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" aria-hidden="true" />
          {t(`${P}summary.title`)}
        </CardTitle>
        <CardDescription>{t(`${P}summary.description`)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        {errorKey ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {t(`${P}summary.loadError`)}
          </p>
        ) : overview ? (
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold" data-testid="billing-summary-plan">
              {t(`landing.plans.${overview.plan ?? "trial"}.name`)}
            </span>
            <Badge variant="outline" data-testid="billing-summary-status">
              {t(`${P}status.${normalizeStatus(overview)}`)}
            </Badge>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">{t("settingsPage.billing.loading")}</span>
        )}
        <Button asChild variant="outline">
          <Link to="/billing">{t(`${P}summary.open`)}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default BillingSummaryCard;
