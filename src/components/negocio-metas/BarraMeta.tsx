import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { percentagemBarra } from "./negocioMetas";

interface BarraMetaProps {
  atual: number;
  meta: number;
  /** Texto lido por leitores de ecrã: o que a barra mede. */
  rotulo: string;
  className?: string;
}

/** Barra de progresso fina; o valor da barra nunca passa de 100. */
export function BarraMeta({ atual, meta, rotulo, className }: BarraMetaProps) {
  const valor = percentagemBarra(atual, meta);
  const completa = valor >= 100;
  return (
    <Progress
      value={valor}
      aria-label={rotulo}
      className={cn(
        "h-2 bg-muted",
        completa ? "[&>div]:bg-success" : "[&>div]:bg-primary",
        className,
      )}
    />
  );
}
