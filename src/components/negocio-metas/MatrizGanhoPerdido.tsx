import { useId } from "react";
import { Lock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { GrupoRadios } from "./GrupoRadios";
import type { MudancaWorkflow } from "./useWorkflowExemplo";
import {
  OPCOES_CONTRATO_PERDIDO, OPCOES_ORCAMENTO_GANHO, OPCOES_ORCAMENTO_PERDIDO, OPCOES_PROPOSTA_GANHO,
  OPCOES_PROPOSTA_PERDIDO, acaoDe, capitalizar, opcoesAdmitidas, traduzir, type Celula, type ConfigWorkflow,
  type FaseCadeia, type Texto,
} from "./workflowNegocio";

interface CelulaMatrizProps<T extends string> {
  celula: Celula;
  linha: FaseCadeia;
  coluna: "ganho" | "perdido";
  valor: T;
  opcoes: readonly T[];
  indisponiveis: Record<T, Texto | null>;
  aoMudar: (valor: T) => void;
}

/** Uma célula da matriz: um grupo de opções com a legenda "Orçamento · Ganho"; o defeito vem primeiro. */
function CelulaMatriz<T extends string>({ celula, linha, coluna, valor, opcoes, indisponiveis, aoMudar }: CelulaMatrizProps<T>) {
  const { t } = useTranslation();
  return (
    <GrupoRadios
      nivel="h5"
      legenda={t("businessGoals.workflow.matriz.celula", {
        linha: t(`businessGoals.workflow.no.${linha}`), coluna: t(`businessGoals.workflow.matriz.${coluna}`),
      })}
      ajuda={t(`businessGoals.workflow.matriz.ajuda.${celula}`)} valor={valor} opcoes={opcoes} indisponiveis={indisponiveis}
      rotulo={(o) => capitalizar(traduzir(t, acaoDe(celula, o)))} aoMudar={aoMudar}
    />
  );
}

/** Contrato · Ganho: um contrato assinado fecha sempre o negócio como ganho, por isso só se lê. */
function ContratoGanhoFixo() {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 rounded-lg border border-border p-4">
      <h5 className="text-sm font-semibold text-foreground">
        {t("businessGoals.workflow.matriz.celula", {
          linha: t("businessGoals.workflow.no.contrato"), coluna: t("businessGoals.workflow.matriz.ganho"),
        })}
      </h5>
      <p className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
        <Lock aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span>
          {capitalizar(traduzir(t, acaoDe("contratoGanho", "assinado")))}
          <span className="block text-xs text-muted-foreground">{t("businessGoals.workflow.matriz.fixed")}</span>
        </span>
      </p>
    </div>
  );
}

/** Uma linha desligada em «Fases em uso» não mostra opções: diz só porquê, por baixo. */
function LinhaDesligada({ chave }: { chave: string }) {
  const { t } = useTranslation();
  return (
    <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground md:col-span-2">{t(chave)}</p>
  );
}

interface MatrizGanhoPerdidoProps {
  config: ConfigWorkflow;
  aoMudar: (mudanca: MudancaWorkflow) => void;
}

/** A e B · O que acontece ao ganhar ou perder cada passo: linhas Orçamento, Proposta e Contrato, colunas Ganho e Perdido. */
export function MatrizGanhoPerdido({ config, aoMudar }: MatrizGanhoPerdidoProps) {
  const { t } = useTranslation();
  const admitidas = opcoesAdmitidas(config);
  const id = useId();
  return (
    <section aria-labelledby={`${id}-titulo`} className="space-y-3 rounded-lg border border-border p-4">
      <h4 id={`${id}-titulo`} className="text-sm font-semibold text-foreground">{t("businessGoals.workflow.matriz.title")}</h4>
      <p className="text-sm text-muted-foreground">{t("businessGoals.workflow.matriz.help")}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <CelulaMatriz
          celula="orcamentoGanho" linha="orcamento" coluna="ganho" valor={config.orcamentoGanho}
          opcoes={OPCOES_ORCAMENTO_GANHO} indisponiveis={admitidas.orcamentoGanho}
          aoMudar={(orcamentoGanho) => aoMudar({ orcamentoGanho })}
        />
        <CelulaMatriz
          celula="orcamentoPerdido" linha="orcamento" coluna="perdido" valor={config.orcamentoPerdido}
          opcoes={OPCOES_ORCAMENTO_PERDIDO} indisponiveis={admitidas.orcamentoPerdido}
          aoMudar={(orcamentoPerdido) => aoMudar({ orcamentoPerdido })}
        />
        {admitidas.linhas.proposta ? (
          <>
            <CelulaMatriz
              celula="propostaGanho" linha="proposta" coluna="ganho" valor={config.propostaGanho}
              opcoes={OPCOES_PROPOSTA_GANHO} indisponiveis={admitidas.propostaGanho}
              aoMudar={(propostaGanho) => aoMudar({ propostaGanho })}
            />
            <CelulaMatriz
              celula="propostaPerdido" linha="proposta" coluna="perdido" valor={config.propostaPerdido}
              opcoes={OPCOES_PROPOSTA_PERDIDO} indisponiveis={admitidas.propostaPerdido}
              aoMudar={(propostaPerdido) => aoMudar({ propostaPerdido })}
            />
          </>
        ) : (
          <LinhaDesligada chave="businessGoals.workflow.matriz.propostaOff" />
        )}
        {admitidas.linhas.contrato ? (
          <>
            <ContratoGanhoFixo />
            <CelulaMatriz
              celula="contratoPerdido" linha="contrato" coluna="perdido" valor={config.contratoPerdido}
              opcoes={OPCOES_CONTRATO_PERDIDO} indisponiveis={admitidas.contratoPerdido}
              aoMudar={(contratoPerdido) => aoMudar({ contratoPerdido })}
            />
          </>
        ) : (
          <LinhaDesligada chave="businessGoals.workflow.matriz.contratoOff" />
        )}
      </div>
    </section>
  );
}
