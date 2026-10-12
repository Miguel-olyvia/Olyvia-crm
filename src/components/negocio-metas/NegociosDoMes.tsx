import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatarMeta } from "./formatoMetas";
import { CadeiaNegocio } from "./CadeiaNegocio";
import { faseDoNegocio, valorDoNegocio, type NegocioMes } from "./negocioMetas";

interface NegociosDoMesProps {
  negocios: NegocioMes[];
}

function LinhaNegocio({ negocio }: { negocio: NegocioMes }) {
  const { t } = useTranslation();
  const [aberto, setAberto] = useState(false);
  const painelId = `cadeia-${negocio.id}`;
  const fase = faseDoNegocio(negocio);
  const acao = aberto ? "businessGoals.deals.collapse" : "businessGoals.deals.expand";

  return (
    <li className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={painelId}
        aria-label={`${negocio.pessoa} · ${negocio.servico}: ${t(acao)}`}
        onClick={() => setAberto((v) => !v)}
        className="flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-180")}
        />
        <span className="grid min-w-0 flex-1 gap-x-4 gap-y-1 sm:grid-cols-[1.4fr_1.2fr_auto_auto_1fr] sm:items-center">
          <span className="truncate text-sm font-semibold text-foreground">{negocio.pessoa}</span>
          <span className="truncate text-sm text-muted-foreground">{negocio.servico}</span>
          <Badge variant="outline" className="w-fit">{t(`businessGoals.phase.${fase}`)}</Badge>
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground sm:text-right">
            {formatarMeta("euro", valorDoNegocio(negocio))}
          </span>
          <span className="truncate text-xs text-muted-foreground">{negocio.comercial}</span>
        </span>
      </button>
      {aberto && <CadeiaNegocio negocio={negocio} id={painelId} />}
    </li>
  );
}

/** Uma linha por negócio; cada uma expande para mostrar a sua cadeia. */
export function NegociosDoMes({ negocios }: NegociosDoMesProps) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="negocios-mes-titulo" className="space-y-3">
      <h2 id="negocios-mes-titulo" className="text-base font-semibold text-foreground">
        {t("businessGoals.deals.title")}
      </h2>
      <ul className="space-y-2">
        {negocios.map((n) => (
          <LinhaNegocio key={n.id} negocio={n} />
        ))}
      </ul>
    </section>
  );
}
