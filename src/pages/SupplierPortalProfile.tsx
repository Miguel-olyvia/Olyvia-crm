import { Loader2, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useSupplierPortal } from "@/contexts/SupplierPortalContext";
import { isNoSupplierAccess, isSpFunctionMissing, spErrorMessage } from "@/lib/supplierPortal/spRpc";
import { SupplierDataForm } from "@/components/supplier-portal/SupplierDataForm";
import { useSpMySupplierData } from "@/components/supplier-portal/useSpMySupplierData";

function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");
}

/** Portal do Fornecedor — "Os meus dados": dados da empresa que as empresas clientes veem no CRM. */
export default function SupplierPortalProfile() {
  const { refresh, markProfileConfirmed } = useSupplierPortal();
  const { toast } = useToast();
  const { data, error, isLoading, isError, isFetching, refetch, invalidate } = useSpMySupplierData();

  useEffect(() => {
    if (isError && isNoSupplierAccess(error)) void refresh();
  }, [isError, error, refresh]);

  const confirmedAt = formatDateTime(data?.confirmed_at ?? null);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Os meus dados</h1>
        <p className="text-sm text-muted-foreground">
          Dados da sua empresa usados pelas empresas com que trabalha (encomendas, contactos e faturação).
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dados da empresa</CardTitle>
          {confirmedAt && <CardDescription>Dados confirmados em {confirmedAt}</CardDescription>}
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="py-10 flex justify-center" role="status" aria-live="polite">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">A carregar os dados…</span>
            </div>
          )}

          {isError && !isNoSupplierAccess(error) && (
            <div className="py-6 text-center space-y-3" role="alert">
              <p className="text-sm text-destructive">
                {isSpFunctionMissing(error)
                  ? "Esta funcionalidade ainda não está disponível. Tente mais tarde."
                  : spErrorMessage(error)}
              </p>
              {!isSpFunctionMissing(error) && (
                <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => void refetch()} disabled={isFetching}>
                  <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
                  Tentar de novo
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
              submitLabel="Guardar"
              onSaved={(result) => {
                toast({
                  title: "Dados guardados",
                  description:
                    result.updated_count > 1
                      ? `Atualizados em ${result.updated_count} empresas.`
                      : "Os dados da sua empresa estão atualizados.",
                });
                markProfileConfirmed();
                void invalidate();
              }}
              onNoAccess={() => void refresh()}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
