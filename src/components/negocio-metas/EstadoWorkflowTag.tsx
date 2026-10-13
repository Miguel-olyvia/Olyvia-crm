import { Check, CircleHelp, Sparkles } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { EstadoAcao } from "./workflowEtapas";

const ICONE = { existe: Check, novo: Sparkles, confirmar: CircleHelp } as const;

/** "Já existe / Novo / A confirmar": sempre em texto e com um ícone diferente, nunca só pela cor. */
export function EstadoWorkflowTag({ estado }: { estado: EstadoAcao }) {
  const { t } = useTranslation();
  const Icone = ICONE[estado];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        estado === "confirmar" ? "border-dashed border-warning text-foreground" : "border-border text-foreground",
      )}
    >
      <Icone aria-hidden="true" className="h-3 w-3" />
      {t(`businessGoals.workflow.estado.${estado}`)}
    </span>
  );
}
