/**
 * Um chip do calendario: icone + texto (a cor nunca e o unico indicador). O texto sai de `textoDoChip`, que serve
 * tambem a descricao falada de cada celula.
 */
import { CalendarCheck, CircleHelp, Clock, Landmark, MapPinOff, MinusCircle, PlusCircle, type LucideIcon } from "lucide-react";
import { ASPECTO_ESTADO_HE } from "@/components/rh-exemplo/fluxosC/aspectoEstadoHE";
import { useTranslation } from "@/hooks/useTranslation";
import type { ChipDia } from "./diferenca";
import { textoDoChip } from "./textosChips";

const AVISO = "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300";
const NEUTRO = "border-border bg-muted text-muted-foreground";

function aspecto(chip: ChipDia): { Icone: LucideIcon; classes: string } {
  switch (chip.tipo) {
    case "atraso": return { Icone: Clock, classes: AVISO };
    case "falta_marcada": return { Icone: MinusCircle, classes: "border-destructive/50 bg-destructive/10 text-destructive" };
    case "falta_sugerida": return { Icone: CircleHelp, classes: "border-dashed border-destructive/60 bg-background text-destructive" };
    case "extra": return ASPECTO_ESTADO_HE[chip.estado ?? "pendente"];
    case "tempo_a_mais": return { Icone: PlusCircle, classes: NEUTRO };
    case "banco_credito":
    case "banco_debito": return { Icone: Landmark, classes: "border-sky-500/50 bg-sky-500/10 text-sky-800 dark:text-sky-300" };
    case "fora_local": return { Icone: MapPinOff, classes: AVISO };
    case "trabalho_em_folga": return { Icone: CalendarCheck, classes: NEUTRO };
  }
}

export function ChipDoDia({ chip }: { chip: ChipDia }) {
  const { t } = useTranslation();
  const { Icone, classes } = aspecto(chip);
  return (
    <span className={`inline-flex max-w-full items-start gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium leading-snug ${classes}`}>
      <Icone className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{textoDoChip(chip, t)}</span>
    </span>
  );
}
