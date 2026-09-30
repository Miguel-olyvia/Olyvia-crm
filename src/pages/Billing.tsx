import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCompany } from "@/contexts/CompanyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTranslation } from "@/hooks/useTranslation";
import { useBillingOverview, type BillingInvoice, type BillingOverview } from "@/hooks/useBillingOverview";
import { useBillingActions } from "@/hooks/useBillingActions";
import { toast } from "@/lib/toast";
import { BillingUsageSection } from "@/components/billing/BillingUsageSection";
import { BillingPurchaseSections } from "@/components/billing/BillingPurchaseSections";
import { formatBillingDate, msLeft, normalizeStatus, trialWordingKey } from "@/components/billing/billingUtils";

const K = "settingsPage.billing.";
const P = "billing.page.";
const LOCALES: Record<string, string> = { pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR", de: "de-DE" };

const STATUS_BADGE_CLASS: Record<string, string> = {
  trialing: "border-blue-500 text-blue-700 dark:text-blue-300",
  active: "border-green-600 text-green-700 dark:text-green-400",
  past_due: "border-red-500 text-red-600 dark:text-red-400",
  expired: "border-red-500 text-red-600 dark:text-red-400",
  canceled: "border-muted-foreground text-muted-foreground",
  unknown: "border-muted-foreground text-muted-foreground",
};

const Billing = () => {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const locale = LOCALES[language] ?? "pt-PT";
  const formatEUR = (value: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(Number(value) || 0);
  const formatDate = (value: string) => formatBillingDate(value, locale);

  const { overview, loading, errorKey, refresh } = useBillingOverview(organizationId);
  const canManage = overview?.can_manage_billing === true;
  const { busy, activeAction, startCheckout, openPortal } = useBillingActions(organizationId, canManage, () => {
    void refresh();
  });

  // Return from Stripe Checkout (?checkout=success|cancel). The webhook may land a
  // moment after the browser, so the data is reloaded a second time after 3s.
  const [searchParams, setSearchParams] = useSearchParams();
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (!checkout) return;
    // Deep link: keep the params until the organization is known, then handle them once.
    if (!organizationId) return;
    const next = new URLSearchParams(searchParams);
    next.delete("checkout");
    next.delete("session_id");
    setSearchParams(next, { replace: true });
    if (checkout === "success") {
      toast.success(t(`${K}checkoutSuccess`));
      void refreshRef.current();
      const retry = setTimeout(() => void refreshRef.current(), 3000);
      return () => clearTimeout(retry);
    }
    if (checkout === "cancel" || checkout === "cancelled" || checkout === "canceled") {
      toast(t(`${K}checkoutCancelled`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const planLabel = (plan: string) => t(`landing.plans.${plan}.name`);

  const renderHeader = (data: BillingOverview) => {
    const status = normalizeStatus(data);
    const trialMs = status === "trialing" ? msLeft(data.trial_ends_at) : null;
    const trialWording =
      trialMs === null
        ? null
        : trialWordingKey(trialMs, {
            expired: `${K}trialExpired`,
            lastDay: `${P}trialLastDay`,
            one: `${P}trialDaysLeftOne`,
            other: `${K}trialDaysLeft`,
          });
    const showCta = canManage && (status === "trialing" || status === "expired" || status === "canceled");
    return (
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <p className="text-sm text-muted-foreground">{t(`${K}currentPlan`)}</p>
              <p className="text-2xl font-semibold" data-testid="billing-plan-name">
                {planLabel(data.plan ?? "trial")}
              </p>
            </div>
            <Badge variant="outline" data-testid="billing-status-badge" className={STATUS_BADGE_CLASS[status]}>
              {t(`${P}status.${status}`)}
            </Badge>
          </div>
          {trialWording && (
            <p className="text-sm text-muted-foreground">{t(trialWording.key, { days: trialWording.days ?? 0 })}</p>
          )}
          {data.current_period_end && (status === "active" || status === "past_due") && (
            <p className="text-sm text-muted-foreground">
              {t(`${P}renewsOn`, { date: formatDate(data.current_period_end) })}
            </p>
          )}
          {data.current_period_end && status === "canceled" && (
            <p className="text-sm text-muted-foreground">
              {t(`${P}accessUntil`, { date: formatDate(data.current_period_end) })}
            </p>
          )}
          {status === "past_due" && <p className="text-sm text-red-600 dark:text-red-400">{t(`${K}pastDueHint`)}</p>}
          {showCta && <p className="text-sm font-medium">{t(`${P}chooseAPlan`)}</p>}
        </CardContent>
      </Card>
    );
  };

  const renderInvoiceStatus = (status: BillingInvoice["status"]) => {
    if (status === "pago") {
      return <Badge className="border-transparent bg-green-600 text-white hover:bg-green-600">{t(`${K}statusPaid`)}</Badge>;
    }
    if (status === "cancelado") return <Badge variant="secondary">{t(`${K}statusCancelled`)}</Badge>;
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400">
        {t(`${K}statusPending`)}
      </Badge>
    );
  };

  const invoices = overview?.invoices ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-8" aria-busy={loading}>
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <CreditCard className="h-6 w-6" aria-hidden="true" />
          {t(`${P}title`)}
        </h1>
        <p className="text-sm text-muted-foreground">{t(`${P}subtitle`)}</p>
      </header>

      {!organizationId && (
        <p role="status" className="text-sm text-muted-foreground">
          {t(`${K}noOrganization`)}
        </p>
      )}

      {organizationId && errorKey && (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-md border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300">
          <p>{t(`${K}${errorKey}`)}</p>
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
            {t(`${K}retry`)}
          </Button>
        </div>
      )}

      {organizationId && loading && !overview && !errorKey && (
        <Loader2 role="status" aria-label={t(`${K}loading`)} className="h-6 w-6 animate-spin" />
      )}

      {organizationId && overview && !errorKey && (
        <>
          {!canManage && (
            <p role="note" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              {t(`${K}managedByOwner`)}
            </p>
          )}

          {renderHeader(overview)}

          <BillingUsageSection organizationId={organizationId} />

          <section aria-labelledby="billing-credits-title" className="space-y-2">
            <h2 id="billing-credits-title" className="text-lg font-semibold">
              {t(`${K}creditsBalance`)}
            </h2>
            <p className="text-2xl font-semibold" data-testid="billing-credits-balance">
              {`${overview.balance_credits ?? 0} ${t(`${K}creditsUnit`)}`}
            </p>
          </section>

          {canManage && (
            <>
              <section aria-labelledby="billing-portal-title" className="space-y-2">
                <h2 id="billing-portal-title" className="text-lg font-semibold">
                  {t(`${P}portal.title`)}
                </h2>
                <p className="text-sm text-muted-foreground">{t(`${P}portal.help`)}</p>
                <Button
                  onClick={() => void openPortal()}
                  disabled={busy || loading}
                  aria-busy={activeAction === "portal"}
                  variant="outline"
                >
                  {activeAction === "portal" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      {t(`${P}portal.opening`)}
                    </>
                  ) : (
                    <>
                      <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                      {t(`${P}portal.button`)}
                    </>
                  )}
                </Button>
              </section>

              <BillingPurchaseSections
                currentPlan={overview.plan ?? "trial"}
                status={overview.status ?? "active"}
                busy={busy || loading}
                activeAction={activeAction}
                startCheckout={startCheckout}
                formatEUR={formatEUR}
              />

              <section aria-labelledby="billing-invoices-title" className="space-y-3">
                <h2 id="billing-invoices-title" className="text-lg font-semibold">
                  {t(`${K}invoicesTitle`)}
                </h2>
                {invoices.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t(`${K}noInvoices`)}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("common.date")}</TableHead>
                        <TableHead>{t(`${K}type`)}</TableHead>
                        <TableHead>{t("common.description")}</TableHead>
                        <TableHead>{t(`${K}amount`)}</TableHead>
                        <TableHead>{t("common.status")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell>{formatDate(invoice.created_at)}</TableCell>
                          <TableCell>{invoice.type === "plano" ? t(`${K}typePlan`) : t(`${K}typeCredits`)}</TableCell>
                          <TableCell>{invoice.description || "-"}</TableCell>
                          <TableCell>{formatEUR(invoice.amount)}</TableCell>
                          <TableCell>{renderInvoiceStatus(invoice.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default Billing;
