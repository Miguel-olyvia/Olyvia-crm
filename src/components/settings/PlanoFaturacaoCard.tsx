import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreditCard, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";

interface AiCreditPackage {
  id: string;
  name: string;
  credits: number;
  price_sale: number;
  active: boolean;
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
          .select("id, name, credits, price_sale, active")
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
    if (!organizationId) return;

    setBuyingPackageId(pkg.id);
    try {
      const { error } = await (supabase as any).from("invoices").insert({
        organization_id: organizationId,
        type: "creditos",
        package_id: pkg.id,
        amount: pkg.price_sale,
        status: "pendente",
        description: t('settingsPage.billing.purchaseDescription', { name: pkg.name }),
      });

      if (error) throw error;

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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {packages.map((pkg) => (
                <div key={pkg.id} className="border rounded-lg p-4 space-y-2 flex flex-col justify-between">
                  <div>
                    <p className="font-semibold">{pkg.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {pkg.credits} {t('settingsPage.billing.creditsUnit')}
                    </p>
                    <p className="text-lg font-bold">{formatEUR(pkg.price_sale)}</p>
                  </div>
                  <Button
                    size="sm"
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
                </div>
              ))}
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
