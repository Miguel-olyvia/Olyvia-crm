import { Loader2, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useSupplierPortal } from "@/contexts/SupplierPortalContext";
import { isNoSupplierAccess, isSpFunctionMissing, spErrorMessage } from "@/lib/supplierPortal/spRpc";
import { SupplierDataForm } from "@/components/supplier-portal/SupplierDataForm";
import { useSpMySupplierData } from "@/components/supplier-portal/useSpMySupplierData";
import { SpMyPhoneCard } from "@/components/supplier-portal/contract/SpMyPhoneCard";
import { formatarDataHora, usePortalT, type PortalIdioma } from "@/portal-i18n";

/** Data e hora da última confirmação (dd/mm/aaaa hh:mm), ou null se não há data válida. */
function formatDateTime(iso: string | null, idioma: PortalIdioma): string | null {
  if (!iso) return null;
  if (Number.isNaN(new Date(iso).getTime())) return null;
  return formatarDataHora(iso, idioma, "numerico");
}

/** Portal do Fornecedor — "Os meus dados": dados da empresa que as empresas clientes veem no CRM. */
export default function SupplierPortalProfile() {
  const { refresh, markProfileConfirmed } = useSupplierPortal();
  const { toast } = useToast();
  const { t, idioma } = usePortalT();
  const { data, error, isLoading, isError, isFetching, refetch, invalidate } = useSpMySupplierData();

  useEffect(() => {
    if (isError && isNoSupplierAccess(error)) void refresh();
  }, [isError, error, refresh]);

  const confirmedAt = formatDateTime(data?.confirmed_at ?? null, idioma);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">{t("sp.perfil.paginaTitulo")}</h1>
        <p className="text-sm text-muted-foreground">{t("sp.perfil.descricao")}</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("sp.perfil.cartaoTitulo")}</CardTitle>
          {confirmedAt && <CardDescription>{t("sp.perfil.confirmadoEm", { data: confirmedAt })}</CardDescription>}
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="py-10 flex justify-center" role="status" aria-live="polite">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">{t("sp.perfil.aCarregar")}</span>
            </div>
          )}

          {isError && !isNoSupplierAccess(error) && (
            <div className="py-6 text-center space-y-3" role="alert">
              <p className="text-sm text-destructive">
                {isSpFunctionMissing(error) ? t("sp.perfil.indisponivel") : spErrorMessage(error)}
              </p>
              {!isSpFunctionMissing(error) && (
                <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => void refetch()} disabled={isFetching}>
                  <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
                  {t("sp.perfil.tentarNovamente")}
                </Button>
              )}
            </div>
          )}

          {data && (
            <SupplierDataForm
              // Sem key: não remonta depois de gravar (confirmed_at pode não
              // mudar). O formulário já fica com os valores gravados e passa a
              // compará-los como base; o refetch só atualiza o resto do ecrã.
              initial={data}
              idPrefix="sp-profile"
              submitLabel={t("sp.perfil.guardar")}
              onSaved={(result) => {
                toast({
                  title: t("sp.perfil.guardado"),
                  description:
                    result.updated_count > 1
                      ? t("sp.perfil.guardadoVarias", { n: result.updated_count })
                      : t("sp.perfil.guardadoUma"),
                });
                markProfileConfirmed();
                void invalidate();
              }}
              onNoAccess={() => void refresh()}
            />
          )}
        </CardContent>
      </Card>

      <SpMyPhoneCard />
    </div>
  );
}
