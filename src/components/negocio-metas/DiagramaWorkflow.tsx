import { useId, useMemo } from "react";
import { ArrowDown, ArrowRight, Ban } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { descreverFluxo, type SetaFluxo } from "./workflowFluxo";
import type { DestinoDiagrama } from "./workflowSimulacao";
import { traduzir, type ConfigWorkflow, type FaseCadeia } from "./workflowNegocio";

interface DiagramaWorkflowProps {
  config: ConfigWorkflow;
  /** O que a simulação destaca: um nó ("Passo seguinte" e `aria-current`) ou a seta de perdido de um passo. */
  destino: DestinoDiagrama | null;
}

interface NoProps {
  id: FaseCadeia | "ganho";
  ligado: boolean;
  decisao: boolean;
  proximo: boolean;
  ganho: SetaFluxo | undefined;
  perdido: SetaFluxo | undefined;
  perdidoAtual: boolean;
}

/** A seta de ganho que sai de um nó, dita em texto: "ganho: cria a proposta, para Proposta". */
function SetaGanho({ seta }: { seta: SetaFluxo }) {
  const { t } = useTranslation();
  const rotulo = traduzir(t, seta.rotulo);
  return (
    // Escondida aos leitores de ecrã: o mesmo vem por extenso no parágrafo só para eles.
    <p aria-hidden="true" className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <ArrowDown aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 md:hidden" />
      <ArrowRight aria-hidden="true" className="mt-0.5 hidden h-3.5 w-3.5 shrink-0 md:block" />
      <span>{seta.para ? t("businessGoals.workflow.diagram.arrow", { label: rotulo, to: t(`businessGoals.workflow.no.${seta.para}`) }) : rotulo}</span>
    </p>
  );
}

/** A seta de perdido, por baixo da de ganho: só texto. Quando é o resultado da simulação, entra também para os leitores de ecrã. */
function SetaPerdido({ seta, atual }: { seta: SetaFluxo; atual: boolean }) {
  const { t } = useTranslation();
  return (
    <p
      aria-hidden={atual ? undefined : "true"} aria-current={atual ? "true" : undefined}
      className={cn("flex items-start gap-1.5 rounded-md text-xs text-muted-foreground", atual && "border border-primary bg-primary/10 px-2 py-1 font-semibold text-primary dark:text-violet-300")}
    >
      <Ban aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        {traduzir(t, seta.rotulo)}
        {atual && <span className="block">{t("businessGoals.workflow.diagram.result")}</span>}
      </span>
    </p>
  );
}

function NoFluxo({ id, ligado, decisao, proximo, ganho, perdido, perdidoAtual }: NoProps) {
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
        {proximo && <p className="text-xs font-semibold text-primary dark:text-violet-300">{t("businessGoals.workflow.diagram.next")}</p>}
      </div>
      {ganho && <SetaGanho seta={ganho} />}
      {perdido && <SetaPerdido seta={perdido} atual={perdidoAtual} />}
    </li>
  );
}

/**
 * O fluxo do negócio como uma lista ordenada em HTML e CSS (sem biblioteca de diagramas): quatro nós, cada um com
 * a seta de ganho e, por baixo, a de perdido em texto. Cada nó diz por texto se está desligado ou é o passo
 * seguinte; o mesmo vem por extenso num parágrafo só para leitores de ecrã.
 */
export function DiagramaWorkflow({ config, destino }: DiagramaWorkflowProps) {
  const { t } = useTranslation();
  const id = useId();
  const fluxo = useMemo(() => descreverFluxo(config), [config]);
  const comDecisao = fluxo.setas.some((s) => s.de === "proposta" && s.tipo === "ganho" && config.propostaGanho === "perguntarContrato");
  const seta = (de: string, tipo: SetaFluxo["tipo"]) => fluxo.setas.find((s) => s.de === de && s.tipo === tipo);
  return (
    <section aria-labelledby={`${id}-titulo`} className="space-y-3 rounded-lg border border-border bg-card p-4 sm:p-5">
      <h3 id={`${id}-titulo`} className="text-base font-semibold text-foreground">{t("businessGoals.workflow.diagram.title")}</h3>
      <div>
        <h4 className="sr-only">{t("businessGoals.workflow.diagram.text")}</h4>
        <p className="sr-only">{fluxo.frases.map((f) => traduzir(t, f)).join(" ")}</p>
      </div>
      <ol aria-label={t("businessGoals.workflow.diagram.label")} className="grid gap-4 md:grid-cols-4">
        {fluxo.nos.map((no) => (
          <NoFluxo
            key={no.id} id={no.id} ligado={no.ligado} decisao={no.id === "contrato" && comDecisao}
            proximo={destino?.tipo === "no" && destino.no === no.id}
            ganho={seta(no.id, "ganho")} perdido={seta(no.id, "perdido")}
            perdidoAtual={destino?.tipo === "perdido" && destino.de === no.id}
          />
        ))}
      </ol>
    </section>
  );
}
