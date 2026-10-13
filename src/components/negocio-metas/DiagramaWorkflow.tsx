import { useMemo } from "react";
import { ArrowDown, ArrowRight } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { descreverFluxo, traduzir, type ConfigWorkflow, type NoWorkflow, type SetaFluxo } from "./workflowNegocio";

interface DiagramaWorkflowProps {
  config: ConfigWorkflow;
  /** O nó a que a simulação leva: leva "Passo seguinte" e `aria-current="true"`. */
  destino: NoWorkflow | null;
}

interface NoProps {
  id: NoWorkflow;
  ligado: boolean;
  decisao: boolean;
  proximo: boolean;
  seta: SetaFluxo | undefined;
}

/** A seta que sai de um nó, dita em texto: "aceite: cria a proposta, para Proposta". */
function SetaTexto({ seta }: { seta: SetaFluxo }) {
  const { t } = useTranslation();
  return (
    // Escondida aos leitores de ecrã: o mesmo vem por extenso no parágrafo só para eles.
    <p aria-hidden="true" className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <ArrowDown aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 md:hidden" />
      <ArrowRight aria-hidden="true" className="mt-0.5 hidden h-3.5 w-3.5 shrink-0 md:block" />
      <span>{t("businessGoals.workflow.diagram.arrow", { label: traduzir(t, seta.rotulo), to: t(`businessGoals.workflow.no.${seta.para}`) })}</span>
    </p>
  );
}

function NoFluxo({ id, ligado, decisao, proximo, seta }: NoProps) {
  const { t } = useTranslation();
  return (
    <li aria-current={proximo ? "true" : undefined} className="flex flex-col gap-2">
      <div
        className={cn(
          "min-h-11 space-y-1 rounded-lg border px-3 py-2 transition-colors motion-reduce:transition-none",
          ligado ? "border-border bg-card text-foreground" : "border-dashed border-muted-foreground/60 bg-muted/40 text-muted-foreground",
          proximo && "border-primary bg-primary/10 ring-2 ring-primary",
        )}
      >
        <p className="text-sm font-semibold">{t(`businessGoals.workflow.no.${id}`)}</p>
        {!ligado && <p className="text-xs">{t("businessGoals.workflow.diagram.off")}</p>}
        {ligado && decisao && <p className="text-xs text-muted-foreground">{t("businessGoals.workflow.diagram.decision")}</p>}
        {proximo && <p className="text-xs font-semibold text-primary">{t("businessGoals.workflow.diagram.next")}</p>}
      </div>
      {seta && <SetaTexto seta={seta} />}
    </li>
  );
}

/**
 * O fluxo do negócio como uma lista ordenada em HTML e CSS (sem biblioteca de diagramas). Cada nó diz
 * por texto se está desligado ou é o passo seguinte, e as setas levam rótulo escrito; o mesmo vem
 * por extenso num parágrafo só para leitores de ecrã.
 */
export function DiagramaWorkflow({ config, destino }: DiagramaWorkflowProps) {
  const { t } = useTranslation();
  const fluxo = useMemo(() => descreverFluxo(config), [config]);
  const comDecisao = fluxo.setas.some((s) => s.id === "propPerguntar");
  return (
    <section aria-labelledby="wf-diagrama" className="space-y-3 rounded-lg border border-border bg-card p-4 sm:p-5">
      <h3 id="wf-diagrama" className="text-base font-semibold text-foreground">{t("businessGoals.workflow.diagram.title")}</h3>
      <div>
        <h4 className="sr-only">{t("businessGoals.workflow.diagram.text")}</h4>
        <p className="sr-only">{fluxo.frases.map((f) => traduzir(t, f)).join(" ")}</p>
      </div>
      <ol aria-label={t("businessGoals.workflow.diagram.label")} className="grid gap-4 md:grid-cols-4">
        {fluxo.nos.map((no) => (
          <NoFluxo
            key={no.id} id={no.id} ligado={no.ligado} decisao={no.id === "contrato" && comDecisao}
            proximo={destino === no.id} seta={fluxo.setas.find((s) => s.de === no.id)}
          />
        ))}
      </ol>
      <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
        {t("businessGoals.workflow.diagram.lost")}
      </p>
    </section>
  );
}
