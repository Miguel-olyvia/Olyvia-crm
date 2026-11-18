import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePortalCompany } from "@/contexts/PortalCompanyContext";
import { cn } from "@/lib/utils";
import { usePortalT } from "@/portal-i18n";

/**
 * Estado de erro do âmbito do portal (falha a carregar as empresas do cliente).
 *
 * Existe porque "não consegui carregar" NÃO pode ser apresentado como "não tem
 * nada": o PortalCompanyProvider é uma rota-layout que fica montada, por isso
 * mudar de separador não volta a tentar — sem este botão só um recarregamento
 * da página salvava o cliente.
 */
export function PortalOrgsErrorState() {
  const { refetchPortalOrgs, isFetching } = usePortalCompany();
  const { t } = usePortalT();

  return (
    <Card>
      <CardContent className="py-8 text-center space-y-3">
        <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{t("pc.empresas.erro.titulo")}</p>
          <p className="text-xs text-muted-foreground">
            {t("pc.empresas.erro.dica")}
          </p>
        </div>
        {/* Durante a nova tentativa o estado da query continua `error` (e com
            retry + backoff podem passar vários segundos): sem isto o botão
            parecia não fazer nada. */}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={refetchPortalOrgs}
          disabled={isFetching}
          aria-busy={isFetching}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          {isFetching ? t("pc.empresas.erro.aTentar") : t("pc.empresas.erro.tentar")}
        </Button>
      </CardContent>
    </Card>
  );
}
