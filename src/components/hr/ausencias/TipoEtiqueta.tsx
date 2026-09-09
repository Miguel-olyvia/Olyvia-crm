/**
 * O nome de um tipo de ausencia, com a sua cor.
 *
 * A COR NUNCA E O UNICO CANAL. E a mesma regra do `HorarioEditor`: ao lado da
 * bolinha esta sempre o nome, porque quem nao distingue as cores tambem tem de
 * conseguir ler o calendario -- e porque duas organizacoes escolhem o mesmo
 * azul para coisas diferentes.
 */
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { nomeTipoAusencia } from "@/lib/hr/ausencias";
import type { AusenciaTipo } from "@/types/hrAusencias";

/** A cor de recurso quando o tipo nao tem nenhuma definida. */
export const COR_SEM_TIPO = "#94a3b8";

export function corDoTipo(tipo: Pick<AusenciaTipo, "cor"> | null | undefined): string {
  return tipo?.cor?.trim() || COR_SEM_TIPO;
}

interface TipoEtiquetaProps {
  tipo: Pick<AusenciaTipo, "cor" | "codigo" | "nome"> | null | undefined;
  /** Usado quando o tipo nao foi encontrado (apagado, ou sem permissao). */
  nomeAlternativo?: string;
  className?: string;
}

export function TipoEtiqueta({ tipo, nomeAlternativo = "—", className }: TipoEtiquetaProps) {
  const { t } = useTranslation();
  const nome = tipo ? nomeTipoAusencia(tipo, t) : nomeAlternativo;

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: corDoTipo(tipo) }}
      />
      <span>{nome}</span>
    </span>
  );
}
