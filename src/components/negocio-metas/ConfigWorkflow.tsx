import { useId } from "react";
import { Info } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { MatrizGanhoPerdido } from "./MatrizGanhoPerdido";
import { MotivosPerda } from "./MotivosPerda";
import { FOCO } from "./estilos";
import { useWorkflowExemplo, type AvisoWorkflow } from "./useWorkflowExemplo";
import { opcoesAdmitidas, traduzir, type ConfigWorkflow, type Texto } from "./workflowNegocio";

interface FaseLigavelProps {
  nome: string;
  marcada: boolean;
  /** Fixa: o Orçamento (sempre ligado) ou uma fase indisponível, com o motivo à vista. */
  bloqueio: string | null;
  aoMudar?: (ligada: boolean) => void;
}

function FaseLigavel({ nome, marcada, bloqueio, aoMudar }: FaseLigavelProps) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 py-2">
      <input
        type="checkbox" id={id} checked={marcada} disabled={bloqueio !== null}
        onChange={(e) => aoMudar?.(e.target.checked)}
        className={cn("h-5 w-5 shrink-0 accent-primary", FOCO, bloqueio ? "cursor-not-allowed" : "cursor-pointer")}
      />
      <label htmlFor={id} className={cn("flex-1 py-2 text-sm font-medium leading-snug", bloqueio ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer")}>
        {nome}
        {bloqueio && <span className="block text-xs font-normal">{bloqueio}</span>}
      </label>
    </div>
  );
}

/** C · As fases em uso: o Orçamento é fixo; o Contrato só se liga com a Proposta ligada. */
function FasesEmUso({ config }: { config: ConfigWorkflow }) {
  const { t } = useTranslation();
  const { mudar } = useWorkflowExemplo();
  const semProposta: Texto | null = opcoesAdmitidas(config).contratoLigavel;
  return (
    <fieldset className="space-y-2 rounded-lg border border-border p-4">
      <legend className="px-1"><h4 className="text-sm font-semibold text-foreground">{t("businessGoals.workflow.cfg.c.legend")}</h4></legend>
      <p className="text-sm text-muted-foreground">{t("businessGoals.workflow.cfg.c.help")}</p>
      <FaseLigavel nome={t("businessGoals.workflow.no.orcamento")} marcada bloqueio={t("businessGoals.workflow.cfg.c.always")} />
      <FaseLigavel
        nome={t("businessGoals.workflow.no.proposta")} marcada={config.fases.proposta} bloqueio={null}
        aoMudar={(proposta) => mudar({ fases: { proposta } })}
      />
      <FaseLigavel
        nome={t("businessGoals.workflow.no.contrato")} marcada={config.fases.contrato}
        bloqueio={semProposta ? traduzir(t, semProposta) : null}
        aoMudar={(contrato) => mudar({ fases: { contrato } })}
      />
    </fieldset>
  );
}

/** O que mudou sozinho, escrito para quem vê e anunciado a quem usa leitor de ecrã (região sempre montada; cada aviso novo é um nó novo). */
function Avisos({ avisos }: { avisos: AvisoWorkflow[] }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t("businessGoals.workflow.live.label")}>
      {avisos.length > 0 && (
        <ul className="space-y-1 rounded-md border border-border bg-muted/40 p-3">
          {avisos.map((a) => (
            <li key={a.id} className="flex items-start gap-2 text-sm text-foreground">
              <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              {traduzir(t, a.texto)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A configuração do Workflow, em três blocos: a matriz Ganho / Perdido (A e B), as fases em uso (C) e os motivos de perda (F). */
export function OpcoesWorkflow() {
  const { t } = useTranslation();
  const { config, avisos, mudar } = useWorkflowExemplo();
  const id = useId();
  return (
    <section aria-labelledby={`${id}-titulo`} className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-5">
      <h3 id={`${id}-titulo`} className="text-base font-semibold text-foreground">{t("businessGoals.workflow.cfg.title")}</h3>
      <Avisos avisos={avisos} />
      <MatrizGanhoPerdido config={config} aoMudar={mudar} />
      <FasesEmUso config={config} />
      <MotivosPerda motivos={config.motivosPerda} aoMudar={(motivosPerda) => mudar({ motivosPerda })} />
    </section>
  );
}
