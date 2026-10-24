import { useId, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "./estilos";
import { MudarEstadoDialogo } from "./MudarEstadoDialogo";
import { HOJE_EXEMPLO } from "./negocioMetasExemplo";
import { useWorkflowExemplo } from "./useWorkflowExemplo";
import { traduzir, type Texto } from "./workflowNegocio";
import { eventosDoPasso, textoAoMudar, type EventoWorkflow } from "./workflowSimulacao";
import type { NegocioMes } from "./negocioMetas";

interface LinhaProps {
  texto: Texto;
  evento: EventoWorkflow;
  aoEscolher: (evento: EventoWorkflow) => void;
}

/** Uma linha "Se ganho: ..." (ou "Se perdido: ...") e o botão que faz mesmo essa mudança, com o nome do evento. */
function Linha({ texto, evento, aoEscolher }: LinhaProps) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span>{traduzir(t, texto)}</span>
      <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={() => aoEscolher(evento)}>
        {t(`businessGoals.act.event.${evento}`)}
      </Button>
    </li>
  );
}

/**
 * "Ao mudar: Se ganho ... / Se perdido ...": o que o Workflow faz a partir do passo atual, com um botão por linha que
 * muda mesmo o negócio em memória (ver `MudarEstadoDialogo`); não aparece num negócio já ganho.
 */
export function AoMudarNegocio({ negocio }: { negocio: NegocioMes }) {
  const { t } = useTranslation();
  const { config } = useWorkflowExemplo();
  const id = useId();
  const [evento, setEvento] = useState<EventoWorkflow | null>(null);
  const linhas = textoAoMudar(config, negocio);
  if (!linhas) return null;
  const [eventoGanho, eventoPerdido] = eventosDoPasso(negocio);
  return (
    <div className="space-y-1 rounded-md border border-border bg-muted/40 p-3">
      <p id={`${id}-titulo`} className="text-xs font-semibold text-foreground">{t("businessGoals.painel.change")}</p>
      <ul aria-labelledby={`${id}-titulo`} className="space-y-0.5 text-sm text-foreground">
        {linhas.ganho && <Linha texto={linhas.ganho} evento={eventoGanho} aoEscolher={setEvento} />}
        {linhas.perdido && <Linha texto={linhas.perdido} evento={eventoPerdido} aoEscolher={setEvento} />}
      </ul>
      <MudarEstadoDialogo negocio={negocio} evento={evento} config={config} hoje={HOJE_EXEMPLO} aoFechar={() => setEvento(null)} />
    </div>
  );
}
