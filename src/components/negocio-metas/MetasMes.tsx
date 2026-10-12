import { useTranslation } from "@/hooks/useTranslation";
import { BarraMeta } from "./BarraMeta";
import { formatarMeta } from "./formatoMetas";
import type { CartaoMeta } from "./negocioMetas";

interface MetasMesProps {
  cartoes: CartaoMeta[];
}

/** Quatro cartões compactos: o que já foi feito no mês contra a meta. */
export function MetasMes({ cartoes }: MetasMesProps) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="metas-mes-titulo" className="space-y-3">
      <h2 id="metas-mes-titulo" className="text-base font-semibold text-foreground">
        {t("businessGoals.month.title")}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cartoes.map((c) => {
          const nome = t(`businessGoals.card.${c.chave}`);
          return (
            <li key={c.chave} className="rounded-2xl border border-border/70 bg-card p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-muted-foreground">{nome}</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-primary">
                  {c.percentagem}%
                </span>
              </div>
              <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums tracking-tight text-foreground">
                {formatarMeta(c.unidade, c.atual)}
              </p>
              <p className="mb-2.5 text-xs text-muted-foreground">
                {t("businessGoals.month.of")}{" "}
                <span className="font-mono tabular-nums">{formatarMeta(c.unidade, c.meta)}</span>
              </p>
              <BarraMeta atual={c.atual} meta={c.meta} rotulo={`${nome}: ${c.percentagem}%`} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
