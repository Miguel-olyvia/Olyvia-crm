import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, ClipboardList, Info, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSupplierPortal } from "@/contexts/SupplierPortalContext";
import { isNoSupplierAccess, spCatalogList } from "@/lib/supplierPortal/spRpc";
import { useSpOrdersToConfirm } from "@/components/supplier-portal/useSpOrdersToConfirm";

/** Portal do Fornecedor — início: boas-vindas, encomendas por confirmar, empresas com acesso e atalho para o catálogo. */
export default function SupplierPortal() {
  const { user, account, companies, companiesError, canManageCatalog, refresh } = useSupplierPortal();
  const { count: toConfirm, isError: toConfirmError } = useSpOrdersToConfirm();
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
          {firstName ? `Olá, ${firstName}` : "Bem-vindo"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Portal do Fornecedor de <span className="font-medium text-foreground">{account?.display_name}</span>. Aqui
          recebe e confirma as encomendas e mantém o seu catálogo atualizado para as empresas com quem trabalha.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
            Encomendas
          </CardTitle>
          <CardDescription>
            {toConfirm === null && !toConfirmError && "A contar encomendas…"}
            {toConfirmError && "Não foi possível contar as encomendas."}
            {toConfirm !== null &&
              (toConfirm === 0
                ? "Não tem encomendas por confirmar."
                : toConfirm === 1
                  ? "1 encomenda por confirmar"
                  : `${toConfirm.toLocaleString("pt-PT")} encomendas por confirmar`)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="h-11 w-full sm:w-auto gap-2" variant={toConfirm ? "default" : "outline"}>
            <Link to={toConfirm ? "/supplier-portal/orders?estado=to_confirm" : "/supplier-portal/orders"}>
              {toConfirm ? "Ver encomendas por confirmar" : "Ver encomendas"}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" aria-hidden="true" />
            Catálogo
          </CardTitle>
          <CardDescription>
            {activeItems === null && !countError && "A contar artigos…"}
            {countError && "Não foi possível contar os artigos."}
            {activeItems !== null &&
              (activeItems === 1 ? "1 artigo ativo" : `${activeItems.toLocaleString("pt-PT")} artigos ativos`)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!canManageCatalog && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Pode consultar o catálogo. Só o utilizador principal da conta pode alterá-lo.
              </AlertDescription>
            </Alert>
          )}
          <Button asChild className="h-11 w-full sm:w-auto gap-2">
            <Link to="/supplier-portal/catalog">
              {canManageCatalog ? "Gerir catálogo" : "Ver catálogo"}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="sp-companies-title">
        <h2 id="sp-companies-title" className="text-base font-semibold text-foreground">
          Empresas com acesso
        </h2>
        {companiesError && (
          <Alert variant="destructive">
            <AlertDescription>Não foi possível carregar a lista de empresas. Recarregue a página.</AlertDescription>
          </Alert>
        )}
        {!companiesError && companies.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma empresa com acesso ativo.</p>
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
                    Desde {new Date(c.granted_at).toLocaleDateString("pt-PT")}
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
