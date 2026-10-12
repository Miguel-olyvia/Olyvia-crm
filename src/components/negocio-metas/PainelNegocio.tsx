import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { CadeiaNegocio } from "./CadeiaNegocio";
import { COR_FASE, FOCO } from "./estilos";
import { formatarMeta } from "./formatoMetas";
import { faseDoNegocio, valorDoNegocio, type NegocioMes } from "./negocioMetas";
import { proximoPasso, temValor } from "./logicaQuadro";

interface PainelNegocioProps {
  negocio: NegocioMes | null;
  aoFechar: () => void;
}

/** Painel lateral: quem e a fase, o valor e o próximo passo, a cadeia (orçamentos, proposta, contrato) e a ação de abrir. */
export function PainelNegocio({ negocio, aoFechar }: PainelNegocioProps) {
  const { t } = useTranslation();
  return (
    <Sheet open={negocio !== null} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-lg motion-reduce:!animate-none">
        {negocio && (
          <>
            <SheetHeader>
              <SheetTitle>{negocio.pessoa}</SheetTitle>
              <SheetDescription>{negocio.servico} · {negocio.comercial}</SheetDescription>
            </SheetHeader>
            <div className="mt-5 flex-1 space-y-5">
              <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-full", COR_FASE[faseDoNegocio(negocio)])} />
                {t(`businessGoals.phase.${faseDoNegocio(negocio)}`)}
              </p>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t("businessGoals.deals.value")}</dt>
                  <dd className="font-mono text-lg font-semibold tabular-nums">
                    {temValor(negocio) ? formatarMeta("euro", valorDoNegocio(negocio)) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("businessGoals.deals.next")}</dt>
                  <dd className="font-medium">{t(`businessGoals.step.${proximoPasso(negocio)}`)}</dd>
                </div>
              </dl>
              <CadeiaNegocio negocio={negocio} id={`cadeia-${negocio.id}`} />
            </div>
            <div className="mt-6 space-y-2 border-t border-border pt-4">
              <Button asChild className={cn("min-h-11 w-full sm:w-auto", FOCO)}>
                <Link to="/deals">
                  <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("businessGoals.panel.open")}
                </Link>
              </Button>
              <p className="text-xs text-muted-foreground">{t("businessGoals.panel.note")}</p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
