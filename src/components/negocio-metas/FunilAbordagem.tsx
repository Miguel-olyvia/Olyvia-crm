import { useTranslation } from "@/hooks/useTranslation";
import type { DadosFunil } from "./percursoNegocio";

const ETAPAS: readonly (keyof DadosFunil)[] = ["porContactar", "contactado", "visita", "levantamento"];

/** O funil da abordagem, à parte das metas: as pessoas por contactar, contactadas e com visita, e os negócios em Levantamento. Só informação. */
export function FunilAbordagem({ funil }: { funil: DadosFunil }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="funil-titulo" className="space-y-2">
      <h2 id="funil-titulo" className="text-sm font-medium text-muted-foreground">{t("businessGoals.journey.funnel.title")}</h2>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border/70 pt-3 sm:grid-cols-4">
        {ETAPAS.map((etapa) => (
          <li key={etapa} className="flex flex-col">
            <span className="text-xs text-muted-foreground">{t(`businessGoals.journey.funnel.${etapa}`)}</span>
            <span className="font-mono text-xl font-semibold tabular-nums text-foreground">{funil[etapa]}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t("businessGoals.journey.funnel.note")}</p>
    </section>
  );
}
