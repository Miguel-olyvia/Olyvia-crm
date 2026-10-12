import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { EstadoMeta } from "./estadoMeta";
import { COR_BARRA } from "./estilosDashboard";
import { percentagemBarra } from "./negocioMetas";

interface BarraMetaProps {
  atual: number;
  meta: number;
  /** Texto lido por leitores de ecrã: o que a barra mede. */
  rotulo: string;
  /** Estado da meta; define a cor do preenchimento (sem ele, só o 100% fica verde). */
  estado?: EstadoMeta;
  className?: string;
}

/** Barra de progresso; o valor da barra nunca passa de 100. */
export function BarraMeta({ atual, meta, rotulo, estado, className }: BarraMetaProps) {
  const valor = percentagemBarra(atual, meta);
  const cor = COR_BARRA[estado ?? (valor >= 100 ? "atingida" : "noRitmo")];
  return (
    <Progress
      value={valor}
      aria-label={rotulo}
      className={cn("h-2.5 bg-muted", cor, className)}
    />
  );
}
