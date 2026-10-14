/** O estado de uma hora extra: ícone + texto (a cor nunca é o único indicador). */
import { CheckCircle2, Clock, OctagonAlert, XCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import type { EstadoVisivelHE } from "./horasExtraRegras";

const ASPECTO: Record<EstadoVisivelHE, { Icone: typeof Clock; classes: string }> = {
  pendente: { Icone: Clock, classes: "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300" },
  acima_limite: { Icone: OctagonAlert, classes: "border-destructive/50 bg-destructive/10 text-destructive" },
  confirmada: { Icone: CheckCircle2, classes: "border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" },
  rejeitada: { Icone: XCircle, classes: "border-border bg-muted text-muted-foreground" },
};

export function EstadoHoraExtraBadge({ estado }: { estado: EstadoVisivelHE }) {
  const { t } = useTranslation();
  const { Icone, classes } = ASPECTO[estado];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${classes}`}>
      <Icone className="h-3.5 w-3.5" aria-hidden="true" />
      {t(`rhFluxosC.he.estado.${estado}`)}
    </span>
  );
}
