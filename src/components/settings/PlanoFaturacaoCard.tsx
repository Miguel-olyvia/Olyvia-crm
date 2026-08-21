import { useEffect, useState } from "react";
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
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);
  const [packages, setPackages] = useState<AiCreditPackage[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    if (organizationId) {
      loadData(organizationId);
    }
  }, [organizationId]);

  const loadData = async (orgId: string) => {
    setLoading(true);
    try {
      const [balanceResult, packagesResult, invoicesResult] = await Promise.all([
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
      ]);

      if (balanceResult.error && balanceResult.error.code !== "PGRST116") throw balanceResult.error;
      if (packagesResult.error) throw packagesResult.error;
      if (invoicesResult.error) throw invoicesResult.error;

      setCreditsBalance(balanceResult.data?.balance_credits ?? 0);
      setPackages(packagesResult.data || []);
      setInvoices(invoicesResult.data || []);
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
            <p className="text-lg font-semibold">{t('settingsPage.billing.planStandard')}</p>
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
