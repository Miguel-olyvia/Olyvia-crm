// Os documentos antigos da pessoa (orçamentos, propostas e contratos) que se podem ligar já ao criar o negócio. Só existe com a M6 aplicada
// (`neg_criar_negocio` passa a aceitá-los em p_registos). Um contrato sem orçamento nem proposta não se oferece: a base recusa-o (NG014).
import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { DocumentoPorLigar } from "@/components/negocio-metas/costuraNegocio";
import { FOCO } from "@/components/negocio-metas/estilos";
import { oQueDoDocumento } from "./DocumentosPorLigar";

const C = "pessoasPagina.neg.create.docs.";

interface Props {
  id: string;
  documentos: readonly DocumentoPorLigar[];
  /** As chaves `<tipo>:<id>` dos marcados. */
  marcados: ReadonlySet<string>;
  aoAlternar: (documento: DocumentoPorLigar) => void;
}

export const chaveDocumento = (d: Pick<DocumentoPorLigar, "tipo" | "id">): string => `${d.tipo}:${d.id}`;

export function DocumentosNoCriar({ id, documentos, marcados, aoAlternar }: Props) {
  const { t } = useTranslation();
  const titulo = useId();
  const ofertaveis = documentos.filter((d) => d.temBase);
  if (ofertaveis.length === 0) return null;
  return (
    <div role="group" aria-labelledby={titulo} className="space-y-1">
      <h3 id={titulo} className="text-base font-semibold text-foreground">{t(`${C}title`)}</h3>
      <p className="text-sm text-muted-foreground">{t(`${C}hint`)}</p>
      <ul role="list" className="list-none p-0">
        {ofertaveis.map((d) => {
          const campo = `${id}-doc-${d.tipo}-${d.id}`;
          return (
            <li key={chaveDocumento(d)} className="flex min-h-11 items-start gap-3 py-2">
              <input
                id={campo} type="checkbox" checked={marcados.has(chaveDocumento(d))} onChange={() => aoAlternar(d)}
                className={cn("mt-0.5 h-5 w-5 shrink-0 rounded-sm border-input accent-primary", FOCO)}
              />
              <label htmlFor={campo} className="cursor-pointer text-sm text-foreground">{oQueDoDocumento(t, d)}</label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
