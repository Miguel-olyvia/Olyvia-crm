import { useId, type Ref } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";

interface BotoesPainelProps {
  guardar: () => void;
  aoCancelar: () => void;
  desativado: boolean;
  /** Porque é que o botão não faz nada ainda (visível, e lida pelo leitor de ecrã). */
  dica: string;
  rotuloGuardar?: string;
  destrutivo?: boolean;
  /** O Cancelar vem primeiro e é o que recebe o foco (a ação é grave). */
  cancelarPrimeiro?: boolean;
  refCancelar?: Ref<HTMLButtonElement>;
}

/**
 * Guardar e Cancelar. Sem o que falta, "Guardar" fica `aria-disabled` (continua focável e lido) e a dica diz o que fazer;
 * o clique é ignorado em vez de o botão ser `disabled`.
 */
export function BotoesPainel(p: BotoesPainelProps) {
  const { t } = useTranslation();
  const idDica = useId();
  const guardar = (
    <Button
      key="guardar" type="button" variant={p.destrutivo ? "destructive" : "default"} aria-disabled={p.desativado || undefined}
      aria-describedby={p.desativado ? idDica : undefined}
      className={cn("min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50", FOCO)}
      onClick={() => { if (!p.desativado) p.guardar(); }}
    >
      {p.rotuloGuardar ?? t("pessoasPagina.panel.save")}
    </Button>
  );
  const cancelar = (
    <Button key="cancelar" ref={p.refCancelar} type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={p.aoCancelar}>
      {t("pessoasPagina.panel.cancel")}
    </Button>
  );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">{p.cancelarPrimeiro ? [cancelar, guardar] : [guardar, cancelar]}</div>
      {p.desativado && <p id={idDica} className="text-xs text-muted-foreground">{p.dica}</p>}
    </div>
  );
}
