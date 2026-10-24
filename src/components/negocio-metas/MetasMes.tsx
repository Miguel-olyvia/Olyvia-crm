import { useTranslation } from "@/hooks/useTranslation";
import { BarraMeta } from "./BarraMeta";
import { EstadoMetaTag } from "./EstadoMetaTag";
import { estadoDaMeta } from "./estadoMeta";
import { ALTURA, CARTAO } from "./estilosDashboard";
import { formatarMeta } from "./formatoMetas";
import type { CartaoMeta } from "./negocioMetas";
import { cn } from "@/lib/utils";

interface MetasMesProps {
  cartoes: CartaoMeta[];
  /** Ritmo esperado hoje, em % (dia do mês sobre dias do mês). */
  ritmo: number;
  /** Aviso mostrado quando os números do Quadro estão filtrados por comercial. */
  nota?: string;
}

/** O foco da página: quatro metas do mês com valor, meta, percentagem e estado. */
export function MetasMes({ cartoes, ritmo, nota }: MetasMesProps) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="metas-mes-titulo" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="metas-mes-titulo" className="text-lg font-semibold text-foreground">
          {t("businessGoals.month.title")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("businessGoals.month.pace", { pace: Math.round(ritmo) })}
          {nota ? ` · ${nota}` : ""}
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cartoes.map((c) => {
          const nome = t(`businessGoals.card.${c.chave}`);
          const estado = estadoDaMeta(c.percentagem, ritmo);
          return (
            <li key={c.chave} className={cn(CARTAO, ALTURA.metas, "flex flex-col p-4")}>
              <span className="text-sm font-medium text-muted-foreground">{nome}</span>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl">
                {formatarMeta(c.unidade, c.atual)}
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                {t("businessGoals.month.of")}{" "}
                <span className="font-mono tabular-nums">{formatarMeta(c.unidade, c.meta)}</span>
              </p>
              <BarraMeta
                atual={c.atual}
                meta={c.meta}
                estado={estado}
                rotulo={`${nome}: ${c.percentagem}%`}
                className="mt-auto"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                  {c.percentagem}%
                </span>
                <EstadoMetaTag estado={estado} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
