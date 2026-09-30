import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import type { PlanKey } from "@/hooks/useBillingOverview";
import { cn } from "@/lib/utils";

const K = "settingsPage.billing.";
const PAID_PLANS: PlanKey[] = ["starter", "pro", "enterprise"];

interface AiCreditPackage {
  id: string;
  name: string;
  credits: number;
  price_sale: number;
  active: boolean;
  is_popular: boolean;
}

interface PlanPrice {
  plan: PlanKey;
  price_eur: number | null;
}

interface CheckoutStarter {
  (options: { body: Record<string, unknown>; actionId: string; successKey: string; errorTitleKey: string }): unknown;
}

interface BillingPurchaseSectionsProps {
  currentPlan: PlanKey;
  /** Subscription status from the overview (active, trialing, past_due, expired, canceled...). */
  status: string;
  busy: boolean;
  activeAction: string | null;
  startCheckout: CheckoutStarter;
  formatEUR: (value: number) => string;
}

/**
 * Plan cards and AI-credit packages. Rendered only for the payer, so the catalog
 * is never even requested for members who cannot buy.
 */
export function BillingPurchaseSections({
  currentPlan,
  status,
  busy,
  activeAction,
  startCheckout,
  formatEUR,
}: BillingPurchaseSectionsProps) {
  const { t } = useTranslation();
  const [packages, setPackages] = useState<AiCreditPackage[]>([]);
  const [planPrices, setPlanPrices] = useState<PlanPrice[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError(false);
    (async () => {
      try {
        const [packagesResult, pricesResult] = await Promise.all([
          (supabase as any)
            .from("ai_credit_packages")
            .select("id, name, credits, price_sale, active, is_popular")
            .eq("active", true)
            .order("credits"),
          (supabase as any).from("plan_pricing").select("plan, price_eur").order("price_eur"),
        ]);
        if (cancelled) return;
        if (packagesResult.error) throw packagesResult.error;
        if (pricesResult.error) throw pricesResult.error;
        setPackages(packagesResult.data || []);
        setPlanPrices(pricesResult.data || []);
      } catch {
        if (cancelled) return;
        setPackages([]);
        setPlanPrices([]);
        setCatalogError(true);
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  // A live paid subscription (active / past_due) is changed in the payment portal:
  // the server refuses a second checkout (subscription_exists), so do not offer one.
  const hasLiveSubscription = (status === "active" || status === "past_due") && currentPlan !== "trial";
  const lapsed = status === "expired" || status === "canceled";

  const planLabel = (plan: PlanKey) => t(`landing.plans.${plan}.name`);
  const spinner = (className: string) => (
    <Loader2 role="status" aria-label={t(`${K}loading`)} className={cn("animate-spin", className)} />
  );

  return (
    <>
      <section aria-labelledby="billing-plans-title" className="space-y-3">
        <h2 id="billing-plans-title" className="text-lg font-semibold">
          {t(`${K}changePlanTitle`)}
        </h2>
        {catalogError && (
          <div role="alert" className="flex flex-col items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300">
            <p>{t(`${K}loadError`)}</p>
            <Button size="sm" variant="outline" onClick={() => setReloadTick((n) => n + 1)} disabled={catalogLoading}>
              {t(`${K}retry`)}
            </Button>
          </div>
        )}
        {hasLiveSubscription && (
          <p className="text-sm text-muted-foreground">
            {t("billing.page.changeInPortal")}{" "}
            <a href="#billing-portal-title" className="font-medium underline underline-offset-2">
              {t("billing.page.changeInPortalLink")}
            </a>
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PAID_PLANS.map((plan) => {
            const isCurrent = currentPlan === plan && !lapsed;
            const isRenewal = currentPlan === plan && lapsed;
            const price = planPrices.find((p) => p.plan === plan)?.price_eur ?? null;
            const actionLabel = isRenewal ? t(`${K}renewPlan`) : t(`${K}changePlan`);
            return (
              <Card key={plan} className={cn(isCurrent && "border-2 border-primary")}>
                <CardContent className="flex flex-col items-center gap-3 p-4 text-center">
                  <p className="font-semibold">{planLabel(plan)}</p>
                  <p className="text-xl font-bold">
                    {price != null ? (
                      <>
                        {formatEUR(price)}
                        <span className="text-xs font-normal text-muted-foreground">{t(`${K}priceMonth`)}</span>
                      </>
                    ) : (
                      <span className="text-sm font-normal text-muted-foreground">
                        {catalogLoading ? spinner("inline h-4 w-4") : t(`${K}planPriceUnavailable`)}
                      </span>
                    )}
                  </p>
                  {isCurrent ? (
                    <Badge variant="secondary">{t(`${K}currentPlanBadge`)}</Badge>
                  ) : hasLiveSubscription ? null : (
                    <Button
                      size="sm"
                      className="w-full"
                      variant={isRenewal ? "default" : "outline"}
                      aria-label={`${actionLabel}: ${planLabel(plan)}`}
                      aria-busy={activeAction === `plan:${plan}`}
                      disabled={price == null || busy}
                      onClick={() =>
                        startCheckout({
                          body: { type: "plano", target_plan: plan },
                          actionId: `plan:${plan}`,
                          successKey: `${K}changePlanSuccess`,
                          errorTitleKey: `${K}changePlanError`,
                        })
                      }
                    >
                      {activeAction === `plan:${plan}` ? (
                        <>
                          {spinner("mr-2 h-4 w-4")}
                          {t(`${K}changingPlan`)}
                        </>
                      ) : (
                        actionLabel
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="billing-packages-title" className="space-y-3">
        <h2 id="billing-packages-title" className="text-lg font-semibold">
          {t(`${K}packagesTitle`)}
        </h2>
        {catalogLoading && packages.length === 0 ? (
          <div className="flex justify-center py-8">{spinner("h-6 w-6")}</div>
        ) : packages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t(`${K}noPackages`)}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
            {packages.map((pkg) => (
              <Card
                key={pkg.id}
                className={cn(
                  "relative flex flex-col overflow-visible",
                  pkg.is_popular ? "border-2 border-primary shadow-md" : "hover:shadow-md",
                )}
              >
                {pkg.is_popular && (
                  <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
                    <Badge className="gap-1 whitespace-nowrap px-3 py-1 shadow-sm">
                      <Sparkles className="h-3 w-3" />
                      {t(`${K}mostPopular`)}
                    </Badge>
                  </div>
                )}
                <CardContent
                  className={cn(
                    "flex h-full flex-col items-center justify-between gap-5 p-5 text-center",
                    pkg.is_popular ? "pt-7" : "pt-6",
                  )}
                >
                  <div className="space-y-3">
                    <p className={cn("font-semibold tracking-tight", pkg.is_popular ? "text-primary" : "text-foreground")}>
                      {pkg.name}
                    </p>
                    <div>
                      <p className="text-3xl font-bold leading-none tracking-tight">{pkg.credits}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{t(`${K}creditsUnit`)}</p>
                    </div>
                    <p className="text-xl font-bold text-foreground">{formatEUR(pkg.price_sale)}</p>
                  </div>
                  <Button
                    className="w-full"
                    variant={pkg.is_popular ? "default" : "outline"}
                    aria-label={`${t(`${K}buy`)}: ${pkg.name}`}
                    aria-busy={activeAction === `pkg:${pkg.id}`}
                    disabled={busy}
                    onClick={() =>
                      startCheckout({
                        body: { type: "creditos", package_id: pkg.id },
                        actionId: `pkg:${pkg.id}`,
                        successKey: `${K}buySuccess`,
                        errorTitleKey: `${K}buyError`,
                      })
                    }
                  >
                    {activeAction === `pkg:${pkg.id}` ? (
                      <>
                        {spinner("mr-2 h-4 w-4")}
                        {t(`${K}buying`)}
                      </>
                    ) : (
                      t(`${K}buy`)
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export default BillingPurchaseSections;
