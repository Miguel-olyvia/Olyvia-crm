import { AlertTriangle, User } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatarMeta } from "./formatoMetas";
import { faseDoNegocio, valorDoNegocio, type FaseNegocio, type NegocioMes } from "./negocioMetas";
import { FASES, LIMITE_PARADOS, proximoPasso, temValor, totaisPorFase } from "./logicaQuadro";

const COR_FASE: Record<FaseNegocio, string> = {
  orcamento: "bg-info",
  proposta: "bg-primary",
  contrato: "bg-warning",
  financeiro: "bg-success",
};

interface QuadroNegociosProps {
  negocios: NegocioMes[];
  aoAbrir: (negocio: NegocioMes) => void;
}

function CartaoNegocio({ negocio, aoAbrir }: { negocio: NegocioMes; aoAbrir: (n: NegocioMes) => void }) {
  const { t } = useTranslation();
  const semValor = !temValor(negocio);
  const parado = negocio.parado !== null && negocio.parado > LIMITE_PARADOS;
  return (
    <li>
      <Card
        className={cn(
          "transition-shadow hover:shadow-md",
          (parado || negocio.atraso) && "border-l-4 border-l-warning",
          semValor && "border-l-4 border-l-destructive",
        )}
      >
        <button
          type="button"
          onClick={() => aoAbrir(negocio)}
          aria-label={`${negocio.pessoa} · ${negocio.servico}`}
          className="block min-h-11 w-full rounded-lg p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="block text-sm font-medium leading-tight">{negocio.servico}</span>
          <span className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{negocio.pessoa}</span>
          </span>
          <span className="mt-2 flex items-center justify-between">
            <span className={cn("text-sm font-semibold tabular-nums", semValor && "text-destructive")}>
              {semValor ? "—" : formatarMeta("euro", valorDoNegocio(negocio))}
              {semValor && <AlertTriangle className="ml-1 inline h-3 w-3" aria-hidden="true" />}
            </span>
            <span className={cn("text-xs tabular-nums", parado ? "font-semibold text-warning" : "text-muted-foreground")}>
              {negocio.dias}d
            </span>
          </span>
          <span className="mt-1 block truncate text-[11px] text-muted-foreground">{negocio.comercial}</span>
          <span className="mt-2 block border-t border-border/50 pt-2 text-xs font-medium text-foreground">
            {t(`businessGoals.step.${proximoPasso(negocio)}`)}
          </span>
        </button>
      </Card>
    </li>
  );
}

/** Quadro: uma coluna por fase (calculada, por isso sem arrastar). */
export function QuadroNegocios({ negocios, aoAbrir }: QuadroNegociosProps) {
  const { t } = useTranslation();
  const totais = totaisPorFase(negocios);
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {FASES.map((fase) => {
        const cartoes = negocios.filter((n) => faseDoNegocio(n) === fase);
        const nome = t(`businessGoals.phase.${fase}`);
        return (
          <section
            key={fase}
            aria-labelledby={`coluna-${fase}`}
            className="flex min-w-[260px] flex-1 flex-col rounded-lg border bg-muted/30"
          >
            <div className="flex items-center justify-between border-b p-3">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className={cn("h-3 w-3 rounded-full", COR_FASE[fase])} />
                <h3 id={`coluna-${fase}`} className="text-sm font-semibold">{nome}</h3>
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">{totais[fase].n}</Badge>
              </div>
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {formatarMeta("euro", totais[fase].valor)}
              </span>
            </div>
            <ul className="min-h-[120px] flex-1 space-y-2 p-2">
              {cartoes.map((n) => (
                <CartaoNegocio key={n.id} negocio={n} aoAbrir={aoAbrir} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
