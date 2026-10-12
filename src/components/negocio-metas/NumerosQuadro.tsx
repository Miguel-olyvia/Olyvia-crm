import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { ALTURA } from "./estilosDashboard";
import { formatarMeta } from "./formatoMetas";
import type { NumeroDashboard } from "./logicaQuadro";

interface NumerosQuadroProps {
  numeros: NumeroDashboard[];
  /** Mostra o valor de cada número (só quando filtrado: sem filtro repetia o subtítulo da página). */
  comValor: boolean;
}

/** Faixa secundária, discreta: os números do Quadro (ou do comercial escolhido). */
export function NumerosQuadro({ numeros, comValor }: NumerosQuadroProps) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="numeros-titulo" className="space-y-2">
      <h2 id="numeros-titulo" className="text-sm font-medium text-muted-foreground">
        {t("businessGoals.numbers.title")}
      </h2>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border/70 pt-3 sm:grid-cols-4">
        {numeros.map((n) => (
          <li key={n.chave} className={cn(ALTURA.numeros)}>
            <span
              className="text-xs text-muted-foreground"
              title={n.chave === "ponderado" ? t("businessGoals.numbers.ponderadoHint") : undefined}
            >
              {t(`businessGoals.numbers.${n.chave}`)}
            </span>
            <p className="font-mono text-xl font-semibold tabular-nums text-foreground">
              {n.euros ? formatarMeta("euro", n.valor) : n.valor}
            </p>
            {comValor && n.valorNota !== null && (
              <p className="text-xs text-muted-foreground">
                {t("businessGoals.numbers.worth", { value: formatarMeta("euro", n.valorNota) })}
              </p>
            )}
            {n.chave === "ponderado" && (
              <p className="sr-only">{t("businessGoals.numbers.ponderadoHint")}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
