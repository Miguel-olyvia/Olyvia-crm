import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Building2, ClipboardList, Info, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSupplierPortal } from "@/contexts/SupplierPortalContext";
import { isNoSupplierAccess, spCatalogList } from "@/lib/supplierPortal/spRpc";
import { useSpOrdersSlaAlert, useSpOrdersToConfirm } from "@/components/supplier-portal/useSpOrdersToConfirm";
import { SP_SLA_ALERT_ORDERS_HREF, spSlaAlertText } from "@/components/supplier-portal/SpOrdersSlaBanner";
import { cn } from "@/lib/utils";
import { usePortalT } from "@/portal-i18n";

/** Portal do Fornecedor — início: boas-vindas, encomendas por confirmar, empresas com acesso e atalho para o catálogo. */
export default function SupplierPortal() {
  const { user, account, companies, companiesError, canManageCatalog, refresh } = useSupplierPortal();
  const { t, tn } = usePortalT();
  const { count: toConfirm, isError: toConfirmError } = useSpOrdersToConfirm();
  const { alert: slaAlert, overdue: slaOverdue } = useSpOrdersSlaAlert();
  const hasSlaAlert = !!slaAlert && slaAlert > 0;
  const slaIsOverdue = (slaOverdue ?? 0) > 0;
  const [activeItems, setActiveItems] = useState<number | null>(null);
  const [countError, setCountError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    spCatalogList({ search: null, limit: 1, offset: 0, includeInactive: false })
      .then((res) => {
        if (!cancelled) setActiveItems(res.total);
      })
      .catch((err) => {
        if (cancelled) return;
        if (isNoSupplierAccess(err)) {
          void refresh();
          return;
        }
        setCountError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const firstName = (user?.name || "").trim().split(/\s+/)[0];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">
          {firstName ? t("sp.inicio.ola", { nome: firstName }) : t("sp.inicio.boasVindas")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("sp.inicio.introAntes")}
          <span className="font-medium text-foreground">{account?.display_name}</span>
          {t("sp.inicio.introDepois")}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
            {t("sp.inicio.encomendas.titulo")}
          </CardTitle>
          <CardDescription>
            {toConfirm === null && !toConfirmError && t("sp.inicio.encomendas.aContar")}
            {toConfirmError && t("sp.inicio.encomendas.erroContar")}
            {toConfirm !== null &&
              (toConfirm === 0
                ? t("sp.inicio.encomendas.nenhumaPorConfirmar")
                : tn("sp.encomendas.porConfirmar.um", "sp.encomendas.porConfirmar.varios", toConfirm))}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {hasSlaAlert && (
            <div
              className={cn(
                "flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between",
                slaIsOverdue
                  ? "border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100"
                  : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100",
              )}
            >
              <p className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {spSlaAlertText(slaAlert, tn)}
              </p>
              <Button asChild variant="outline" className="h-11 gap-2 bg-background">
                <Link to={SP_SLA_ALERT_ORDERS_HREF}>
                  {t("sp.inicio.encomendas.verPrazos")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          )}
          <Button asChild className="h-11 w-full sm:w-auto gap-2" variant={toConfirm ? "default" : "outline"}>
            <Link to={toConfirm ? "/supplier-portal/orders?estado=to_confirm" : "/supplier-portal/orders"}>
              {toConfirm ? t("sp.inicio.encomendas.verPorConfirmar") : t("sp.inicio.encomendas.ver")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" aria-hidden="true" />
            {t("sp.inicio.catalogo.titulo")}
          </CardTitle>
          <CardDescription>
            {activeItems === null && !countError && t("sp.inicio.catalogo.aContar")}
            {countError && t("sp.inicio.catalogo.erroContar")}
            {activeItems !== null && tn("sp.inicio.catalogo.ativos.um", "sp.inicio.catalogo.ativos.varios", activeItems)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!canManageCatalog && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>{t("sp.inicio.catalogo.soConsulta")}</AlertDescription>
            </Alert>
          )}
          <Button asChild className="h-11 w-full sm:w-auto gap-2">
            <Link to="/supplier-portal/catalog">
              {canManageCatalog ? t("sp.inicio.catalogo.gerir") : t("sp.inicio.catalogo.ver")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="sp-companies-title">
        <h2 id="sp-companies-title" className="text-base font-semibold text-foreground">
          {t("sp.inicio.empresas.titulo")}
        </h2>
        {companiesError && (
          <Alert variant="destructive">
            <AlertDescription>{t("sp.inicio.empresas.erro")}</AlertDescription>
          </Alert>
        )}
        {!companiesError && companies.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("sp.inicio.empresas.nenhuma")}</p>
        )}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => (
            <li key={c.organization_id} className="flex items-center gap-3 rounded-lg border bg-background p-3">
              {c.logo_url ? (
                <img
                  src={c.logo_url}
                  alt=""
                  width={40}
                  height={40}
                  loading="lazy"
                  className="h-10 w-10 rounded-md object-contain shrink-0 bg-muted"
                />
              ) : (
                <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Building2 className="h-5 w-5" aria-hidden="true" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate" title={c.name}>
                  {c.name}
                </p>
                {c.granted_at && (
                  <p className="text-xs text-muted-foreground">
                    {t("sp.inicio.empresas.desde", { data: new Date(c.granted_at).toLocaleDateString("pt-PT") })}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
