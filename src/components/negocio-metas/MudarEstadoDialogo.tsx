import { useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { FOCO } from "./estilos";
import { aplicarEvento, escolhasDaPergunta, type Aplicacao } from "./negocioAcoes";
import { guardarNegocio, perderNegocio } from "./negociosAlterados";
import { faseDoNegocio, type NegocioMes } from "./negocioMetas";
import { acaoDe, capitalizar, traduzir, type ConfigWorkflow } from "./workflowNegocio";
import { simularEvento, type EventoWorkflow } from "./workflowSimulacao";

const A = "businessGoals.act.";

interface MudarEstadoDialogoProps {
  negocio: NegocioMes;
  /** O evento a aplicar; `null` = fechado. */
  evento: EventoWorkflow | null;
  config: ConfigWorkflow;
  /** O dia de hoje (AAAA-MM-DD). */
  hoje: string;
  aoFechar: () => void;
}

/** Grava o resultado e avisa. Um negócio perdido sai do quadro; um ganho ou em curso fica com a fase nova. */
function gravar(resultado: Aplicacao, hoje: string, t: (chave: string, params?: Record<string, string | number>) => string): void {
  if (resultado.tipo === "perdido") perderNegocio(resultado.negocio, resultado.motivo, hoje);
  else guardarNegocio(resultado.negocio);
  const fase = resultado.tipo === "curso" ? t(`businessGoals.workflow.no.${faseDoNegocio(resultado.negocio)}`) : "";
  toast.success(t(`${A}state.done.${resultado.tipo}`, { fase }));
}

interface FormEstadoProps extends Omit<MudarEstadoDialogoProps, "evento"> {
  evento: EventoWorkflow;
}

function FormEstado({ negocio, evento, config, hoje, aoFechar }: FormEstadoProps) {
  const { t } = useTranslation();
  const id = useId();
  const escolhas = useMemo(() => escolhasDaPergunta(config, evento), [config, evento]);
  const sim = simularEvento(config, evento, negocio);
  const pergunta = sim.tipo === "resultado" && sim.estado.tipo === "pergunta";
  const [escolha, setEscolha] = useState(escolhas[0]?.valor);
  const [motivo, setMotivo] = useState(config.motivosPerda[0]);
  const previa = aplicarEvento(config, evento, negocio, { escolha: pergunta ? escolha : undefined, motivo, hoje });

  const confirmar = () => {
    if (!previa) return;
    gravar(previa, hoje, t);
    aoFechar();
  };
  return (
    <div className="space-y-4">
      {sim.tipo === "resultado" && <p className="text-sm text-foreground">{t(`${A}state.result`, { resultado: traduzir(t, sim.resultado) })}</p>}
      {pergunta && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-foreground">{t(`${A}state.ask`)}</legend>
          {escolhas.map((e) => (
            <label key={e.valor} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-foreground">
              <input
                type="radio" name={`${id}-escolha`} value={e.valor} checked={escolha === e.valor}
                className={cn("h-5 w-5 accent-primary", FOCO)} onChange={() => setEscolha(e.valor)}
              />
              {capitalizar(traduzir(t, acaoDe(e.celula, e.valor)))}
            </label>
          ))}
        </fieldset>
      )}
      {previa?.tipo === "perdido" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-motivo`}>{t(`${A}state.reason`)}</Label>
          <NativeSelect
            id={`${id}-motivo`} value={motivo} className={cn("h-11", FOCO)} placeholder={t(`${A}state.reason.placeholder`)}
            options={config.motivosPerda.map((m) => ({ value: m, label: m }))} onValueChange={setMotivo}
          />
        </div>
      )}
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoFechar}>{t(`${A}state.cancel`)}</Button>
        <Button type="button" className={cn("min-h-11", FOCO)} disabled={!previa} onClick={confirmar}>{t(`${A}state.confirm`)}</Button>
      </DialogFooter>
    </div>
  );
}

/**
 * Ganhar ou perder o passo atual de um negócio: mostra o que o Workflow manda fazer, pergunta o que falta (a resposta,
 * quando a configuração diz "perguntar", e o motivo, se o negócio se perde) e muda o negócio EM MEMÓRIA
 * (`negociosAlterados.ts`). Só exemplo: nada é gravado.
 */
export function MudarEstadoDialogo({ negocio, evento, config, hoje, aoFechar }: MudarEstadoDialogoProps) {
  const { t } = useTranslation();
  const ultimo = useRef<EventoWorkflow | null>(evento);
  if (evento) ultimo.current = evento;
  const mostrado = evento ?? ultimo.current;
  return (
    <Dialog open={evento !== null} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <DialogContent className="motion-reduce:!animate-none">
        <DialogHeader>
          <DialogTitle>{mostrado ? t(`${A}event.${mostrado}`) : ""}</DialogTitle>
          <DialogDescription>{t(`${A}state.description`, { name: negocio.pessoa })}</DialogDescription>
        </DialogHeader>
        {mostrado && <FormEstado key={mostrado} negocio={negocio} evento={mostrado} config={config} hoje={hoje} aoFechar={aoFechar} />}
      </DialogContent>
    </Dialog>
  );
}
