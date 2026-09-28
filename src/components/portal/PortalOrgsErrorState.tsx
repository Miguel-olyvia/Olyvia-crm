import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePortalCompany } from "@/contexts/PortalCompanyContext";
import { cn } from "@/lib/utils";

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

  return (
    <Card>
      <CardContent className="py-8 text-center space-y-3">
        <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Não foi possível carregar os seus dados.</p>
          <p className="text-xs text-muted-foreground">
            Verifique a ligação à internet e tente novamente.
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
          {isFetching ? "A tentar..." : "Tentar novamente"}
        </Button>
      </CardContent>
    </Card>
  );
}
