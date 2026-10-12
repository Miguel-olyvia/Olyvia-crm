import { AlertTriangle, ArrowRight } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BARRA_FASE, COR_FASE, FOCO } from "./estilos";
import { formatarMeta } from "./formatoMetas";
import { faseDoNegocio, valorDoNegocio, type FaseNegocio, type NegocioMes } from "./negocioMetas";
import { FASES, LIMITE_PARADOS, proximoPasso, temValor, totaisPorFase } from "./logicaQuadro";
import { CARTAO } from "./useAtalhosQuadro";

interface QuadroNegociosProps {
  negocios: NegocioMes[];
  aoAbrir: (negocio: NegocioMes) => void;
  /** Só quando há filtros ligados: dá às colunas vazias a ação de os limpar. */
  aoLimpar?: () => void;
}

interface CartaoProps {
  negocio: NegocioMes;
  fase: FaseNegocio;
  coluna: number;
  pos: number;
  aoAbrir: (n: NegocioMes) => void;
}

/** Um cartão: quem, o quê, quanto, o aviso (se houver) e o próximo passo. A fase vê-se pela coluna, pela barra e pelo texto da coluna. */
function CartaoNegocio({ negocio, fase, coluna, pos, aoAbrir }: CartaoProps) {
  const { t } = useTranslation();
  const semValor = !temValor(negocio);
  const passo = t(`businessGoals.step.${proximoPasso(negocio)}`);
  const valor = semValor ? t("businessGoals.card.noValue") : formatarMeta("euro", valorDoNegocio(negocio));
  const avisos = [
    negocio.atraso ? t("businessGoals.card.overdue") : null,
    negocio.parado !== null && negocio.parado > LIMITE_PARADOS
      ? t("businessGoals.card.stalled", { count: negocio.parado })
      : null,
  ].filter((a): a is string => a !== null);
  return (
    <li>
      <Card className={cn("overflow-hidden border-l-4", BARRA_FASE[fase])}>
        <button
          type="button"
          {...{ [CARTAO]: "", "data-coluna": coluna, "data-pos": pos }}
          onClick={() => aoAbrir(negocio)}
          aria-label={t("businessGoals.card.label", { person: negocio.pessoa, service: negocio.servico, value: valor, step: passo })}
          className={cn("group block min-h-11 w-full cursor-pointer p-3 text-left hover:bg-muted/50", FOCO)}
        >
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0 truncate text-sm font-semibold text-foreground">{negocio.pessoa}</span>
            <span
              className="shrink-0 text-xs tabular-nums text-muted-foreground"
              title={t("businessGoals.card.age", { count: negocio.dias })}
            >
              {negocio.dias}d
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{negocio.servico}</span>
          <span className="mt-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-sm font-semibold tabular-nums text-foreground">
              {semValor && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />}
              {valor}
            </span>
            <span className="truncate text-xs text-muted-foreground">{negocio.comercial}</span>
          </span>
          {avisos.length > 0 && (
            <span className="mt-1.5 flex items-center gap-1 text-xs font-medium text-foreground">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
              {avisos.join(" · ")}
            </span>
          )}
          <span className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-xs font-medium text-foreground">
            {passo}
            <ArrowRight
              className="h-3.5 w-3.5 shrink-0 group-hover:translate-x-0.5 motion-safe:transition-transform motion-safe:duration-150"
              aria-hidden="true"
            />
          </span>
        </button>
      </Card>
    </li>
  );
}

/**
 * Quadro: uma coluna por fase (calculada, por isso sem arrastar). No telemóvel
 * as colunas rolam na horizontal e cada uma encaixa no início.
 */
export function QuadroNegocios({ negocios, aoAbrir, aoLimpar }: QuadroNegociosProps) {
  const { t } = useTranslation();
  const totais = totaisPorFase(negocios);
  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4">
      {FASES.map((fase, coluna) => {
        const cartoes = negocios.filter((n) => faseDoNegocio(n) === fase);
        return (
          <section
            key={fase}
            aria-labelledby={`coluna-${fase}`}
            className="flex min-w-[85%] flex-1 snap-start flex-col overflow-hidden rounded-lg border bg-muted/30 sm:min-w-[240px]"
          >
            <div aria-hidden="true" className={cn("h-1", COR_FASE[fase])} />
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <h3 id={`coluna-${fase}`} className="truncate text-sm font-semibold">{t(`businessGoals.phase.${fase}`)}</h3>
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">{totais[fase].n}</Badge>
              </div>
              <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                {formatarMeta("euro", totais[fase].valor)}
              </span>
            </div>
            <ul className="min-h-[120px] flex-1 space-y-2 p-2">
              {cartoes.map((n, pos) => (
                <CartaoNegocio key={n.id} negocio={n} fase={fase} coluna={coluna} pos={pos} aoAbrir={aoAbrir} />
              ))}
              {cartoes.length === 0 && (
                <li className="flex flex-col items-start gap-1 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                  {t("businessGoals.column.empty")}
                  {aoLimpar && (
                    <Button type="button" variant="ghost" size="sm" className="-ml-2 min-h-11" onClick={aoLimpar}>
                      {t("businessGoals.column.clear")}
                    </Button>
                  )}
                </li>
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
