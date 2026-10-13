import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useWorkflowExemplo } from "./useWorkflowExemplo";
import { traduzir } from "./workflowNegocio";
import { textoAoMudar } from "./workflowSimulacao";
import type { NegocioMes } from "./negocioMetas";

/** "Ao mudar: Se ganho ... / Se perdido ...": o que o Workflow faz a partir do passo atual; não aparece num negócio já ganho. */
export function AoMudarNegocio({ negocio }: { negocio: NegocioMes }) {
  const { t } = useTranslation();
  const { config } = useWorkflowExemplo();
  const id = useId();
  const linhas = textoAoMudar(config, negocio);
  if (!linhas) return null;
  return (
    <div className="space-y-1 rounded-md border border-border bg-muted/40 p-3">
      <p id={`${id}-titulo`} className="text-xs font-semibold text-foreground">{t("businessGoals.painel.change")}</p>
      <ul aria-labelledby={`${id}-titulo`} className="space-y-0.5 text-sm text-foreground">
        {linhas.ganho && <li>{traduzir(t, linhas.ganho)}</li>}
        {linhas.perdido && <li>{traduzir(t, linhas.perdido)}</li>}
      </ul>
    </div>
  );
}
