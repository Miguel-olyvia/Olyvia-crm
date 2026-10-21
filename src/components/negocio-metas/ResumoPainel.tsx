import { useId, useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { AoMudarNegocio } from "./AoMudarNegocio";
import { registosDoNegocio } from "./acoesRegistos";
import { levantamentoDerivado, visitasDerivadas } from "./derivadosDoNegocio";
import { useRegistosPessoa } from "./registosPessoa";
import { TituloPainel } from "./CamposPainel";
import { CadeiaNegocio } from "./CadeiaNegocio";
import { LevantamentoResumo } from "./LevantamentoResumo";
import { MoradaObraResumo, QualificacaoResumo, VisitaResumo } from "./RespostasResumo";
import { SaudeTag } from "./SaudeTag";
import { VisitasResumo } from "./VisitasResumo";
import { proximoPasso } from "./logicaQuadro";
import type { NegocioMes } from "./negocioMetas";
import { rotuloPrazo } from "./saudeNegocio";
import { N } from "./PecasNovoNegocio";

/**
 * O separador Resumo: o próximo passo e o prazo, a saúde, a cadeia numa linha e o que o Workflow faz ao mudar. As visitas e o levantamento
 * derivam dos registos da pessoa ligados ao negócio (nada se copia); um negócio de exemplo antigo mostra o que trazia.
 */
export function ResumoPainel({ negocio, hoje }: { negocio: NegocioMes; hoje: string }) {
  const { t } = useTranslation();
  const id = useId();
  const prazo = rotuloPrazo(negocio.proximoPrazo, hoje, t, true);
  const registos = useRegistosPessoa();
  const ligados = useMemo(() => registosDoNegocio(registos, negocio.id), [registos, negocio.id]);
  const visitas = visitasDerivadas(negocio, ligados);
  const levantamento = levantamentoDerivado(negocio, ligados, (grupo, chave) => t(`${N}${grupo}.${chave}`));
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
      {negocio.qualificacao && <QualificacaoResumo respostas={negocio.qualificacao} />}
      {negocio.moradaObra && <MoradaObraResumo morada={negocio.moradaObra} />}
      {negocio.visita && <VisitaResumo seccoes={negocio.visita} />}
      {visitas.length > 0 && <VisitasResumo visitas={visitas} />}
      {levantamento && <LevantamentoResumo levantamento={levantamento} />}
      <AoMudarNegocio negocio={negocio} />
      <p className="text-xs text-muted-foreground">{t("businessGoals.panel.note")}</p>
    </div>
  );
}
