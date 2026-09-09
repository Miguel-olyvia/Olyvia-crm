/**
 * O nome de um local de trabalho, com a bolinha da sua cor.
 *
 * A COR NUNCA E O UNICO CANAL -- e a mesma regra do `HorarioEditor` e do
 * `TipoEtiqueta` das ausencias: ao lado da bolinha esta sempre o nome. Num dia
 * com dois sitios, a cor serve para reconhecer de relance; o nome serve para
 * quem nao distingue cores, e para quem esta a ler o ecra em voz alta.
 *
 * A cor sai de `corDoLocal` do `HorarioEditor`, que a deriva do INDICE do
 * local na lista da organizacao. Repetir aqui outra tabela de cores fazia o
 * mesmo armazem ser azul num ecra e verde no outro.
 */
import { corDoLocal } from "@/components/hr/HorarioEditor";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { LocalTrabalho } from "@/types/hr";

interface LocalEtiquetaProps {
  locais: LocalTrabalho[];
  localId: string | null;
  /** So a bolinha, para dentro de uma celula onde nao cabe texto. */
  soCor?: boolean;
  className?: string;
}

export function nomeDoLocal(
  locais: LocalTrabalho[],
  localId: string | null,
  semLocal: string,
): string {
  if (!localId) return semLocal;
  return locais.find((local) => local.id === localId)?.nome ?? localId;
}

export function LocalEtiqueta({ locais, localId, soCor, className }: LocalEtiquetaProps) {
  const { t } = useTranslation();
  const nome = nomeDoLocal(locais, localId, t("hr.assiduidade.semLocal"));

  if (soCor) {
    return (
      <span
        className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)}
        style={{ backgroundColor: corDoLocal(locais, localId) }}
        // A bolinha sozinha nunca e informacao: o nome vai no titulo de quem
        // a envolve, e por isso ela esconde-se do leitor de ecra.
        aria-hidden="true"
        title={nome}
      />
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: corDoLocal(locais, localId) }}
      />
      <span>{nome}</span>
    </span>
  );
}
