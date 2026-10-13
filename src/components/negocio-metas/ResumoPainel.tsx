import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { AoMudarNegocio } from "./AoMudarNegocio";
import { TituloPainel } from "./CamposPainel";
import { CadeiaNegocio } from "./CadeiaNegocio";
import { SaudeTag } from "./SaudeTag";
import { proximoPasso } from "./logicaQuadro";
import type { NegocioMes } from "./negocioMetas";
import { rotuloPrazo } from "./saudeNegocio";

/** O separador Resumo: o próximo passo e o prazo, a saúde, a cadeia numa linha e o que o Workflow faz ao mudar. */
export function ResumoPainel({ negocio, hoje }: { negocio: NegocioMes; hoje: string }) {
  const { t } = useTranslation();
  const id = useId();
  const prazo = rotuloPrazo(negocio.proximoPrazo, hoje, t, true);
  return (
    <div className="space-y-5">
      <section aria-labelledby={`${id}-passo`} className="space-y-1.5">
        <TituloPainel id={`${id}-passo`}>{t("businessGoals.painel.summary.next")}</TituloPainel>
        <p className="text-sm font-medium text-foreground">{t(`businessGoals.step.${proximoPasso(negocio)}`)}</p>
        {prazo && <p className="text-sm text-foreground">{t("businessGoals.painel.summary.due", { prazo })}</p>}
        <SaudeTag negocio={negocio} hoje={hoje} />
      </section>
      <section aria-labelledby={`${id}-cadeia`} className="space-y-1.5">
        <TituloPainel id={`${id}-cadeia`}>{t("businessGoals.painel.summary.chain")}</TituloPainel>
        <CadeiaNegocio negocio={negocio} id={`cadeia-${negocio.id}`} />
      </section>
      <AoMudarNegocio negocio={negocio} />
      <p className="text-xs text-muted-foreground">{t("businessGoals.panel.note")}</p>
    </div>
  );
}
