import { AlertOctagon, AlertTriangle, CheckCircle2, TrendingUp, type LucideIcon } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { EstadoMeta } from "./estadoMeta";

const ICONE: Record<EstadoMeta, { Icone: LucideIcon; cor: string }> = {
  atingida: { Icone: CheckCircle2, cor: "text-success" },
  noRitmo: { Icone: TrendingUp, cor: "text-primary" },
  emRisco: { Icone: AlertTriangle, cor: "text-warning" },
  atrasada: { Icone: AlertOctagon, cor: "text-destructive" },
};

/** Estado da meta em ícone e texto (a cor só reforça), com aria-label. */
export function EstadoMetaTag({ estado, className }: { estado: EstadoMeta; className?: string }) {
  const { t } = useTranslation();
  const texto = t(`businessGoals.state.${estado}`);
  const { Icone, cor } = ICONE[estado];
  return (
    <span
      role="img"
      aria-label={t("businessGoals.state.label", { state: texto })}
      className={cn("inline-flex items-center gap-1 text-xs font-medium text-foreground", className)}
    >
      <Icone className={cn("h-4 w-4 shrink-0", cor)} aria-hidden="true" />
      <span aria-hidden="true">{texto}</span>
    </span>
  );
}
