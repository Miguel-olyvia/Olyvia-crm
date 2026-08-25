import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreditCard, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { cn } from "@/lib/utils";

interface AiCreditPackage {
  id: string;
  name: string;
  credits: number;
  price_sale: number;
  active: boolean;
  is_popular: boolean;
}

type PlanKey = "trial" | "starter" | "pro" | "enterprise";

interface Subscription {
  plan: PlanKey;
  status: string;
  trial_ends_at: string | null;
}

interface PlanPrice {
  plan: PlanKey;
  price_eur: number | null;
}

interface Invoice {
  id: string;
  organization_id: string;
  type: "plano" | "creditos";
  package_id: string | null;
  amount: number;
  status: "pendente" | "pago" | "cancelado";
  description: string | null;
  created_at: string;
  paid_at: string | null;
}

interface PlanoFaturacaoCardProps {
  organizationId: string | null;
}

const formatEUR = (value: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(value) || 0);

const PlanoFaturacaoCard = ({ organizationId }: PlanoFaturacaoCardProps) => {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [buyingPackageId, setBuyingPackageId] = useState<string | null>(null);
  const [changingPlan, setChangingPlan] = useState<PlanKey | null>(null);
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);
  const [packages, setPackages] = useState<AiCreditPackage[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [planPrices, setPlanPrices] = useState<PlanPrice[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (organizationId) {
      loadData(organizationId);
    }
  }, [organizationId]);

  // Retorno do Stripe Checkout (?checkout=success|cancel). O saldo/plano só
  // ficam corretos depois do stripe-webhook processar o evento — pode chegar
  // com um pequeno atraso em relação ao browser voltar do Checkout, por isso
  // recarregamos os dados uma segunda vez passado 3s.
  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (!checkout || !organizationId) return;

    if (checkout === "success") {
      toast.success(t('settingsPage.billing.checkoutSuccess'));
      loadData(organizationId);
      const retry = setTimeout(() => loadData(organizationId), 3000);
      return () => clearTimeout(retry);
    }
    if (checkout === "cancel") {
      toast(t('settingsPage.billing.checkoutCancelled'));
    }

    const next = new URLSearchParams(searchParams);
    next.delete("checkout");
    next.delete("session_id");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const loadData = async (orgId: string) => {
    setLoading(true);
    try {
      const [balanceResult, packagesResult, invoicesResult, subscriptionResult, planPricesResult] = await Promise.all([
        (supabase as any)
          .from("organization_ai_credits")
          .select("balance_credits")
          .eq("organization_id", orgId)
          .maybeSingle(),
        (supabase as any)
          .from("ai_credit_packages")
          .select("id, name, credits, price_sale, active, is_popular")
          .eq("active", true)
          .order("credits"),
        (supabase as any)
          .from("invoices")
          .select("*")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("organization_subscriptions")
          .select("plan, status, trial_ends_at")
          .eq("organization_id", orgId)
          .maybeSingle(),
        (supabase as any)
          .from("plan_pricing")
          .select("plan, price_eur")
          .order("price_eur"),
      ]);

      if (balanceResult.error && balanceResult.error.code !== "PGRST116") throw balanceResult.error;
      if (packagesResult.error) throw packagesResult.error;
      if (invoicesResult.error) throw invoicesResult.error;
      if (subscriptionResult.error && subscriptionResult.error.code !== "PGRST116") throw subscriptionResult.error;
      if (planPricesResult.error) throw planPricesResult.error;

      setCreditsBalance(balanceResult.data?.balance_credits ?? 0);
      setPackages(packagesResult.data || []);
      setInvoices(invoicesResult.data || []);
      setSubscription(subscriptionResult.data || null);
      setPlanPrices(planPricesResult.data || []);
    } catch (error: any) {
      const friendlyMessage = await getFriendlyErrorMessage(error);
      toast.error(`${t('common.error')}: ${friendlyMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBuyPackage = async (pkg: AiCreditPackage) => {
    if (!organizationId || buyingPackageId) return;

    setBuyingPackageId(pkg.id);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-create-checkout-session', {
        body: {
          organization_id: organizationId,
          type: 'creditos',
          package_id: pkg.id,
        },
      });

      if (error) throw error;
      if (data?.error) throw data;

      if (data?.mode === 'stripe' && data?.url) {
        window.location.href = data.url;
        return;
      }

      // mode === 'manual' (ou resposta desconhecida): comportamento igual ao anterior
      toast.success(t('settingsPage.billing.buySuccess'));
      loadData(organizationId);
    } catch (error: any) {
      const friendlyMessage = await getFriendlyErrorMessage(error);
      toast.error(`${t('settingsPage.billing.buyError')}: ${friendlyMessage}`);
    } finally {
      setBuyingPackageId(null);
    }
  };

  const handleChangePlan = async (targetPlan: PlanKey) => {
    if (!organizationId || changingPlan) return;

    setChangingPlan(targetPlan);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-create-checkout-session', {
        body: {
          organization_id: organizationId,
          type: 'plano',
          target_plan: targetPlan,
        },
      });

      if (error) throw error;
      if (data?.error) throw data;

      if (data?.mode === 'stripe' && data?.url) {
        window.location.href = data.url;
        return;
      }

      toast.success(t('settingsPage.billing.changePlanSuccess'));
      loadData(organizationId);
    } catch (error: any) {
      const friendlyMessage = await getFriendlyErrorMessage(error);
      toast.error(`${t('settingsPage.billing.changePlanError')}: ${friendlyMessage}`);
    } finally {
      setChangingPlan(null);
    }
  };

  const renderStatusBadge = (status: Invoice["status"]) => {
    switch (status) {
      case "pago":
        return (
          <Badge className="border-transparent bg-green-600 text-white hover:bg-green-600">
            {t('settingsPage.billing.statusPaid')}
          </Badge>
        );
      case "cancelado":
        return <Badge variant="secondary">{t('settingsPage.billing.statusCancelled')}</Badge>;
      default:
        return (
          <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400">
            {t('settingsPage.billing.statusPending')}
          </Badge>
        );
    }
  };

  const planLabel = (plan: PlanKey) => t(`landing.plans.${plan}.name`);

  const trialDaysLeft = (() => {
    if (!subscription?.trial_ends_at) return null;
    const diffMs = new Date(subscription.trial_ends_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          {t('settingsPage.billing.title')}
        </CardTitle>
        <CardDescription>{t('settingsPage.billing.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="border rounded-lg p-4">
            <p className="text-sm text-muted-foreground">{t('settingsPage.billing.currentPlan')}</p>
            <p className="text-lg font-semibold">
              {loading && !subscription ? (
                <Loader2 className="w-4 h-4 animate-spin inline" />
              ) : (
                planLabel(subscription?.plan ?? "trial")
              )}
            </p>
            {subscription?.plan === "trial" && trialDaysLeft !== null && (
              <p className="text-xs text-muted-foreground mt-1">
                {trialDaysLeft > 0
                  ? t('settingsPage.billing.trialDaysLeft', { days: trialDaysLeft })
                  : t('settingsPage.billing.trialExpired')}
              </p>
            )}
            {subscription?.status === "past_due" && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                {t('settingsPage.billing.statusPastDue')}
              </p>
            )}
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-sm text-muted-foreground">{t('settingsPage.billing.creditsBalance')}</p>
            <p className="text-lg font-semibold">
              {loading && creditsBalance === null ? (
                <Loader2 className="w-4 h-4 animate-spin inline" />
              ) : (
                `${creditsBalance ?? 0} ${t('settingsPage.billing.creditsUnit')}`
              )}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="font-semibold">{t('settingsPage.billing.changePlanTitle')}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(["starter", "pro", "enterprise"] as PlanKey[]).map((plan) => {
                const isCurrent = subscription?.plan === plan;
                const price = planPrices.find((p) => p.plan === plan)?.price_eur ?? null;
                return (
                  <Card key={plan} className={cn(isCurrent && "border-2 border-primary")}>
                    <CardContent className="flex flex-col items-center gap-3 p-4 text-center">
                      <p className="font-semibold">{planLabel(plan)}</p>
                      <p className="text-xl font-bold">
                        {price != null ? (
                          <>
                            {formatEUR(price)}
                            <span className="text-xs font-normal text-muted-foreground">
                              {t('settingsPage.billing.priceMonth')}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm font-normal text-muted-foreground">
                            {t('settingsPage.billing.planPriceUnavailable')}
                          </span>
                        )}
                      </p>
                      {isCurrent ? (
                        <Badge variant="secondary">{t('settingsPage.billing.currentPlanBadge')}</Badge>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full"
                          variant="outline"
                          disabled={price == null || changingPlan === plan}
                          onClick={() => handleChangePlan(plan)}
                        >
                          {changingPlan === plan ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              {t('settingsPage.billing.changingPlan')}
                            </>
                          ) : (
                            t('settingsPage.billing.changePlan')
                          )}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
        </div>

        <div className="space-y-3">
          <h4 className="font-semibold">{t('settingsPage.billing.packagesTitle')}</h4>
          {loading && packages.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : packages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t('settingsPage.billing.noPackages')}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {packages.map((pkg) => {
                const isPopular = pkg.is_popular;
                return (
                  <Card
                    key={pkg.id}
                    className={cn(
                      "relative flex flex-col overflow-visible transition-all duration-200 hover:-translate-y-1",
                      isPopular
                        ? "border-2 border-primary shadow-md hover:shadow-xl"
                        : "hover:shadow-md",
                    )}
                  >
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                        <Badge className="gap-1 px-3 py-1 shadow-sm whitespace-nowrap">
                          <Sparkles className="w-3 h-3" />
                          {t('settingsPage.billing.mostPopular')}
                        </Badge>
                      </div>
                    )}
                    <CardContent
                      className={cn(
                        "flex flex-col items-center justify-between gap-5 p-5 text-center h-full",
                        isPopular ? "pt-7" : "pt-6",
                      )}
                    >
                      <div className="space-y-3">
                        <p
                          className={cn(
                            "font-semibold tracking-tight",
                            isPopular ? "text-primary" : "text-foreground",
                          )}
                        >
                          {pkg.name}
                        </p>
                        <div>
                          <p className="text-3xl font-bold leading-none tracking-tight">
                            {pkg.credits}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t('settingsPage.billing.creditsUnit')}
                          </p>
                        </div>
                        <p className="text-xl font-bold text-foreground">
                          {formatEUR(pkg.price_sale)}
                        </p>
                      </div>
                      <Button
                        className="w-full"
                        variant={isPopular ? "default" : "outline"}
                        onClick={() => handleBuyPackage(pkg)}
                        disabled={buyingPackageId === pkg.id}
                      >
                        {buyingPackageId === pkg.id ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            {t('settingsPage.billing.buying')}
                          </>
                        ) : (
                          t('settingsPage.billing.buy')
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h4 className="font-semibold">{t('settingsPage.billing.invoicesTitle')}</h4>
          {loading && invoices.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t('settingsPage.billing.noInvoices')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead>{t('settingsPage.billing.type')}</TableHead>
                  <TableHead>{t('common.description')}</TableHead>
                  <TableHead>{t('settingsPage.billing.amount')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>{new Date(invoice.created_at).toLocaleDateString("pt-PT")}</TableCell>
                    <TableCell>
                      {invoice.type === "plano"
                        ? t('settingsPage.billing.typePlan')
                        : t('settingsPage.billing.typeCredits')}
                    </TableCell>
                    <TableCell>{invoice.description || "-"}</TableCell>
                    <TableCell>{formatEUR(invoice.amount)}</TableCell>
                    <TableCell>{renderStatusBadge(invoice.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PlanoFaturacaoCard;
