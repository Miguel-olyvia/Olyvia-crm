import { useTranslation } from "@/hooks/useTranslation";
import { ETAPAS_POR_FASE, acoesPorEtapa } from "./workflowEtapas";
import { traduzir, type ConfigWorkflow } from "./workflowNegocio";
import { EstadoWorkflowTag } from "./EstadoWorkflowTag";

/** D · As etapas de cada fase, só para ler; uma fase desligada diz-se por texto. */
export function EtapasPorFase({ config }: { config: ConfigWorkflow }) {
  const { t } = useTranslation();
  return (
    <fieldset className="space-y-2 rounded-lg border border-border p-4">
      <legend className="px-1"><h4 className="text-sm font-semibold text-foreground">{t("businessGoals.workflow.cfg.d.legend")}</h4></legend>
      <p className="text-sm text-muted-foreground">{t("businessGoals.workflow.cfg.d.help")}</p>
      <ul className="space-y-2">
        {ETAPAS_POR_FASE.map(({ fase, etapas }) => (
          <li key={fase} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="w-24 font-medium text-foreground">{t(`businessGoals.workflow.no.${fase}`)}</span>
            {fase === "orcamento" || config.fases[fase] ? (
              <ol className="flex flex-wrap gap-1.5">
                {etapas.map((e) => (
                  <li key={e} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-foreground">
                    {t(`businessGoals.workflow.etapa.${e}`)}
                  </li>
                ))}
              </ol>
            ) : (
              <span className="text-xs text-muted-foreground">{t("businessGoals.workflow.diagram.off")}</span>
            )}
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/** E · As ações de cada etapa, derivadas de A e B, só para ler: estado em texto e ícone, e uma linha de ajuda. */
export function AcoesPorEtapa({ config }: { config: ConfigWorkflow }) {
  const { t } = useTranslation();
  return (
    <fieldset className="space-y-2 rounded-lg border border-border p-4">
      <legend className="px-1"><h4 className="text-sm font-semibold text-foreground">{t("businessGoals.workflow.cfg.e.legend")}</h4></legend>
      <p className="text-sm text-muted-foreground">{t("businessGoals.workflow.cfg.e.help")}</p>
      <ul className="divide-y divide-border">
        {acoesPorEtapa(config).map((a) => (
          <li key={`${a.fase}-${a.etapa}`} className="flex min-h-11 flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">
                <span className="font-medium">{t(`businessGoals.workflow.no.${a.fase}`)} · {t(`businessGoals.workflow.etapa.${a.etapa}`)}</span>
                {": "}{traduzir(t, a.acao)}
              </p>
              <p className="text-xs text-muted-foreground">{traduzir(t, a.ajuda)}</p>
            </div>
            <EstadoWorkflowTag estado={a.estado} />
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
