import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AcoesNegocio } from "./AcoesNegocio";
import { CartaoNegocio } from "./CartaoNegocio";
import { COR_FASE } from "./estilos";
import { formatarMeta } from "./formatoMetas";
import { FASES, somaValor } from "./logicaQuadro";
import { faseDoNegocio, type FaseNegocio, type NegocioMes } from "./negocioMetas";

interface QuadroNegociosProps {
  /** Os negócios já filtrados e ordenados; dentro de cada coluna a ordem é esta. */
  negocios: NegocioMes[];
  hoje: string;
  /** Fases ligadas nos chips: só essas colunas aparecem; vazio = todas. */
  fases: FaseNegocio[];
  ocultarComercial: boolean;
  selecionados: ReadonlySet<string>;
  acoes: AcoesNegocio;
  aoAbrir: (negocio: NegocioMes) => void;
  aoAlternarSelecao: (id: string) => void;
  /** Só quando há filtros ligados: dá às colunas vazias a ação de os limpar. */
  aoLimpar?: () => void;
}

/**
 * Quadro: uma coluna por fase (calculada, por isso sem arrastar). No telemóvel
 * as colunas rolam na horizontal e cada uma encaixa no início.
 */
export function QuadroNegocios({ negocios, fases, aoLimpar, ...resto }: QuadroNegociosProps) {
  const { t } = useTranslation();
  const mostradas = fases.length > 0 ? FASES.filter((f) => fases.includes(f)) : FASES;
  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4">
      <h2 className="sr-only">{t("businessGoals.section.board")}</h2>
      {mostradas.map((fase, coluna) => {
        const cartoes = negocios.filter((n) => faseDoNegocio(n) === fase);
        const valor = somaValor(cartoes);
        return (
          <section
            key={fase}
            aria-labelledby={`coluna-${fase}`}
            className="flex min-w-[85%] flex-1 snap-start flex-col overflow-hidden rounded-lg border bg-muted/30 sm:min-w-[260px]"
          >
            <div aria-hidden="true" className={cn("h-1", COR_FASE[fase])} />
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <h3 id={`coluna-${fase}`} className="truncate text-sm font-semibold">{t(`businessGoals.phase.${fase}`)}</h3>
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">{cartoes.length}</Badge>
              </div>
              <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{formatarMeta("euro", valor)}</span>
            </div>
            <ul className="min-h-[120px] flex-1 space-y-2 p-2">
              {cartoes.map((n, pos) => (
                <CartaoNegocio
                  key={n.id} negocio={n} fase={fase} coluna={coluna} pos={pos} hoje={resto.hoje}
                  ocultarComercial={resto.ocultarComercial} selecionado={resto.selecionados.has(n.id)}
                  acoes={resto.acoes} aoAbrir={resto.aoAbrir} aoAlternarSelecao={resto.aoAlternarSelecao}
                />
              ))}
              {cartoes.length === 0 && <ColunaVazia aoLimpar={aoLimpar} />}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Coluna sem negócios: diz-o e, se há filtros ligados, oferece limpá-los. */
function ColunaVazia({ aoLimpar }: { aoLimpar?: () => void }) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-col items-start gap-1 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
      {t("businessGoals.column.empty")}
      {aoLimpar && (
        <Button type="button" variant="ghost" size="sm" className="-ml-2 min-h-11" onClick={aoLimpar}>
          {t("businessGoals.column.clear")}
        </Button>
      )}
    </li>
  );
}
