// O estado de uma obra em texto e ícone (a cor só no ícone).
import { CalendarCheck, CheckCircle2, ClipboardList, Hammer, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Plano } from "../motor";

const ESTADO_OBRA: Record<Plano["estado"], { t: string; i: LucideIcon; cor: string }> = {
  "por aprovar": { t: "Plano por aprovar", i: ClipboardList, cor: "text-warning" },
  aprovado: { t: "Aprovado, por arrancar", i: CalendarCheck, cor: "text-primary" },
  "em curso": { t: "Em curso", i: Hammer, cor: "text-primary" },
  "concluída": { t: "Concluída", i: CheckCircle2, cor: "text-success" },
};

export function EstadoObra({ p }: { p: Plano }) {
  const E = ESTADO_OBRA[p.estado];
  return (
    <span className="inline-flex items-center gap-1.5">
      <E.i className={cn("h-5 w-5 shrink-0", E.cor)} aria-hidden="true" />
      <span className="text-foreground">{E.t}</span>
    </span>
  );
}
