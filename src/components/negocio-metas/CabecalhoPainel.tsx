import { AlertTriangle, Euro } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { COR_FASE } from "./estilos";
import { formatarMeta } from "./formatoMetas";
import { temValor } from "./logicaQuadro";
import { faseDoNegocio, valorDoNegocio, type NegocioMes } from "./negocioMetas";
import { textoDias } from "./saudeTexto";

/**
 * O cabeçalho do painel: o nome (o título do painel), "serviço · comercial", a fase (ponto e texto), o valor
 * (ou "Sem valor", com ícone) e há quantos dias o negócio entrou e está parado.
 */
export function CabecalhoPainel({ negocio }: { negocio: NegocioMes }) {
  const { t } = useTranslation();
  const fase = faseDoNegocio(negocio);
  const semValor = !temValor(negocio);
  return (
    <SheetHeader className="space-y-2 border-b border-border p-6 pr-12 text-left">
      <SheetTitle tabIndex={-1} data-titulo-painel="" className="text-lg outline-none">{negocio.pessoa}</SheetTitle>
      <SheetDescription>{[negocio.servico, negocio.comercial].filter(Boolean).join(" · ")}</SheetDescription>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-full", COR_FASE[fase])} />
          {t(`businessGoals.phase.${fase}`)}
        </span>
        <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums">
          {semValor ? <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" /> : <Euro className="h-4 w-4" aria-hidden="true" />}
          {semValor ? t("businessGoals.card.noValue") : formatarMeta("euro", valorDoNegocio(negocio))}
        </span>
        <span className="text-muted-foreground">{t("businessGoals.painel.age", { dias: textoDias(t, negocio.dias, true) })}</span>
        {negocio.parado !== null && (
          <span className="text-muted-foreground">{t("businessGoals.painel.stalled", { dias: textoDias(t, negocio.parado, true) })}</span>
        )}
      </div>
    </SheetHeader>
  );
}
