import { useTranslation } from "@/hooks/useTranslation";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { CadeiaNegocio } from "./CadeiaNegocio";
import { formatarMeta } from "./formatoMetas";
import { faseDoNegocio, valorDoNegocio, type NegocioMes } from "./negocioMetas";
import { proximoPasso, temValor } from "./logicaQuadro";

interface PainelNegocioProps {
  negocio: NegocioMes | null;
  aoFechar: () => void;
}

/** Painel lateral com a cadeia do negócio: orçamentos, proposta e contrato. */
export function PainelNegocio({ negocio, aoFechar }: PainelNegocioProps) {
  const { t } = useTranslation();
  return (
    <Sheet open={negocio !== null} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {negocio && (
          <>
            <SheetHeader>
              <SheetTitle>{negocio.pessoa}</SheetTitle>
              <SheetDescription>
                {negocio.servico} · {negocio.comercial}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{t(`businessGoals.phase.${faseDoNegocio(negocio)}`)}</Badge>
                <Badge variant="secondary">{t("businessGoals.example")}</Badge>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t("businessGoals.deals.value")}</dt>
                  <dd className="font-mono font-semibold tabular-nums">
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
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
