/**
 * O aspecto de cada tipo de pendencia da fila de trabalho: icone, cores por tokens e a etiqueta. A cor nunca e o unico
 * indicador: leva sempre o icone e o texto. Contraste: texto `-800` no tema claro e `-300` no escuro.
 * Um tipo novo acrescenta-se aqui e em `TIPOS_DE_ITEM` (assim entraram «ausencia» e «desvio a validar»).
 */
import { CalendarClock, ClipboardCheck, Clock, FileText, OctagonAlert, type LucideIcon } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { definicaoDoTipo, type TipoFila } from "@/components/rh-exemplo/hooks/useFilaDeTrabalho";
import { cn } from "@/lib/utils";

/** A funcao `t` do `useTranslation`. */
export type Traduzir = (chave: string, params?: Record<string, string | number>) => string;

export const ASPECTO_TIPO_FILA: Record<TipoFila, { Icone: LucideIcon; classes: string }> = {
  hora_extra: { Icone: Clock, classes: "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300" },
  justificacao: { Icone: FileText, classes: "border-sky-500/50 bg-sky-500/10 text-sky-800 dark:text-sky-300" },
  alerta: { Icone: OctagonAlert, classes: "border-destructive/50 bg-destructive/10 text-destructive" },
  desvio_a_validar: { Icone: ClipboardCheck, classes: "border-violet-500/50 bg-violet-500/10 text-violet-800 dark:text-violet-300" },
  ausencia: { Icone: CalendarClock, classes: "border-teal-500/50 bg-teal-500/10 text-teal-800 dark:text-teal-300" },
};

interface EtiquetaDoTipoProps {
  tipo: TipoFila;
  /** Em vez da etiqueta do tipo (por exemplo «Alerta: sem horas»). */
  texto?: string;
  className?: string;
}

/** A etiqueta de um tipo: icone (decorativo) e texto. */
export function EtiquetaDoTipo({ tipo, texto, className }: EtiquetaDoTipoProps) {
  const { t } = useTranslation();
  const { Icone, classes } = ASPECTO_TIPO_FILA[tipo];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", classes, className)}>
      <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {texto ?? t(definicaoDoTipo(tipo).chaveEtiqueta)}
    </span>
  );
}

/** «1 hora extra» / «2 horas extra»: o texto de uma contagem de um tipo. */
export function textoDaContagem(t: Traduzir, tipo: TipoFila, n: number): string {
  return t(`rhFila.contagem.${tipo}.${n === 1 ? "um" : "varios"}`, { n: String(n) });
}

/** «1 pendência» / «3 pendências». */
export function textoDasPendencias(t: Traduzir, n: number): string {
  return t(`rhFila.pendencias.${n === 1 ? "um" : "varios"}`, { n: String(n) });
}

/** «hoje», «há 1 dia», «há 24 dias». */
export function textoDeHaQuanto(t: Traduzir, dias: number): string {
  return dias <= 0 ? t("rhFila.quando.hoje") : t(`rhFila.quando.${dias === 1 ? "um" : "varios"}`, { n: String(dias) });
}
