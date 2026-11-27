/**
 * A etiqueta de estado de relance: cor E texto E ícone (nunca só cor). «Em uso» em verde, «Sem equipamento ligado» em âmbar, «Livre»
 * (um equipamento de pessoas que ninguém tem) e «Desativado» em cinza, cada um com o seu ícone. As cores vêm dos tons do Inventário
 * (`ativosUi.ts`), com contraste suficiente em claro e escuro.
 */
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { TOM_ESTADO } from "./lib/ativosUi";
import type { EstadoDoAtivo } from "./lib/resumoAtivo";

export function EtiquetaEstado({ estado, className }: { estado: EstadoDoAtivo; className?: string }) {
  const { t } = useTranslation();
  const { classes, Icone } = TOM_ESTADO[estado.chave];
  return (
    <span
      data-testid="estado-etiqueta"
      className={cn("inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", classes, className)}
    >
      <Icone aria-hidden="true" className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
      {t(`ativos.estado.${estado.chave}`)}
    </span>
  );
}
