/**
 * A etiqueta de estado de relance: cor E texto E ícone (nunca só cor). «Em uso» em verde, «Desativado» em cinza e, quando falta a
 * ligação, «Sem equipamento ligado» ou «Sem pessoa ligada» em âmbar. Cores com contraste suficiente em claro e escuro.
 */
import { CircleCheck, CircleSlash, TriangleAlert, type LucideIcon } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { EstadoDoAtivo, TomEstado } from "./lib/resumoAtivo";

const TOM: Record<TomEstado, { classes: string; Icone: LucideIcon }> = {
  bom: { classes: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200", Icone: CircleCheck },
  neutro: { classes: "border-border bg-muted text-muted-foreground", Icone: CircleSlash },
  aviso: { classes: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200", Icone: TriangleAlert },
};

export function EtiquetaEstado({ estado, className }: { estado: EstadoDoAtivo; className?: string }) {
  const { t } = useTranslation();
  const { classes, Icone } = TOM[estado.tom];
  return (
    <span data-testid="estado-etiqueta" className={cn("inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium", classes, className)}>
      <Icone aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      {t(`ativos.estado.${estado.chave}`)}
    </span>
  );
}
