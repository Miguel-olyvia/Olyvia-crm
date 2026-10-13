import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { OpcoesWorkflow } from "./ConfigWorkflow";
import { DiagramaWorkflow } from "./DiagramaWorkflow";
import { SimuladorWorkflow } from "./SimuladorWorkflow";
import { FOCO } from "./estilos";
import { faseDoNegocio } from "./negocioMetas";
import { DADOS_EXEMPLO } from "./negocioMetasExemplo";
import { useWorkflowExemplo } from "./useWorkflowExemplo";
import { simularAceite, type EventoAceite, type Simulacao } from "./workflowNegocio";

const { negocios } = DADOS_EXEMPLO;
/** Abre num negócio com uma proposta enviada, onde a simulação já tem resposta. */
const NEGOCIO_INICIAL = (negocios.find((n) => faseDoNegocio(n) === "proposta" && n.proposta?.estado === "enviada") ?? negocios[0]).id;

/**
 * O conteúdo do workflow (hoje no diálogo do botão "Workflow"): o que acontece ao aceitar um orçamento ou uma proposta. Só dados de exemplo e
 * estado local (ver `useWorkflowExemplo`): nada é gravado na organização. Ordem: faixa e repor,
 * diagrama, simulador, configuração.
 */
export function AbaWorkflow({ emDialogo = false }: { emDialogo?: boolean }) {
  const { t } = useTranslation();
  const { config, reposta, repor } = useWorkflowExemplo();
  const [negocioId, setNegocioId] = useState(NEGOCIO_INICIAL);
  const [evento, setEvento] = useState<EventoAceite | null>(null);
  const negocio = negocios.find((n) => n.id === negocioId) ?? negocios[0];
  // Calculado uma só vez: o simulador usa-o para os botões e o resultado, o diagrama para o destino.
  const simulacoes: Record<EventoAceite, Simulacao> = {
    aceitarOrcamento: simularAceite(config, "aceitarOrcamento", negocio),
    aceitarProposta: simularAceite(config, "aceitarProposta", negocio),
  };
  const ativa = evento ? simulacoes[evento] : null;
  const destino = ativa?.tipo === "resultado" ? ativa.proximo : null;

  const mudarNegocio = (id: string) => {
    setNegocioId(id);
    setEvento(null);
  };

  return (
    <div className="space-y-5">
      {/* No diálogo, o título e a descrição dele já dizem isto. */}
      {!emDialogo && <h2 className="text-lg font-semibold text-foreground">{t("businessGoals.workflow.title")}</h2>}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
        {!emDialogo && <p className="min-w-0 flex-1 text-sm text-foreground">{t("businessGoals.workflow.banner")}</p>}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div role="status" className="text-sm font-medium text-foreground">
            {reposta !== null && <span key={reposta}>{t("businessGoals.workflow.reset.done")}</span>}
          </div>
          <Button type="button" variant="outline" onClick={repor} className={`min-h-11 ${FOCO}`}>
            <RotateCcw aria-hidden="true" />
            {t("businessGoals.workflow.reset.button")}
          </Button>
        </div>
      </div>
      <DiagramaWorkflow config={config} destino={destino} />
      <SimuladorWorkflow
        simulacoes={simulacoes} negocios={negocios} negocioId={negocio.id} aoMudarNegocio={mudarNegocio}
        evento={evento} aoSimular={setEvento}
      />
      <OpcoesWorkflow />
    </div>
  );
}
