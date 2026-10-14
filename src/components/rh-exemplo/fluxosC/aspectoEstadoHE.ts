/** O aspecto (icone e cores por tokens) de cada estado de uma hora extra: partilhado pelo selo e pelos chips do calendario. */
import { CheckCircle2, Clock, OctagonAlert, XCircle } from "lucide-react";
import type { EstadoVisivelHE } from "./horasExtraRegras";

export const ASPECTO_ESTADO_HE: Record<EstadoVisivelHE, { Icone: typeof Clock; classes: string }> = {
  pendente: { Icone: Clock, classes: "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300" },
  acima_limite: { Icone: OctagonAlert, classes: "border-destructive/50 bg-destructive/10 text-destructive" },
  confirmada: { Icone: CheckCircle2, classes: "border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" },
  rejeitada: { Icone: XCircle, classes: "border-border bg-muted text-muted-foreground" },
};
