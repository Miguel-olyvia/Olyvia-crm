import type { CSSProperties, ReactNode } from "react";
import DOMPurify from "dompurify";
import { obterIdioma } from "@/lib/idiomaDocumento/registo";

export interface VersaoDoContratoProps {
  /** O idioma da versão («pt», «en»…): vai em `lang` e dá o título quando há mais de uma versão. */
  codigo: string;
  /** O corpo já resolvido desta versão (de resolveContractDocument().versoes), sem o wrapper olv-versao. */
  bodyHtml: string;
  /** Mostra o nome do idioma por cima: só faz sentido com mais de uma versão. */
  mostrarEtiqueta?: boolean;
  className?: string;
  style?: CSSProperties;
  classeCorpo?: string;
  /** Por cima do corpo (por exemplo o cabeçalho do documento nesse idioma). */
  antes?: ReactNode;
  /** Por baixo do corpo (por exemplo o rodapé). */
  depois?: ReactNode;
}

/**
 * Uma versão de idioma de um contrato, no ecrã. É a peça comum da pré-visualização do CRM e do portal do
 * cliente: ambos mostram as `versoes` do resolver que o PDF usa, uma secção por idioma.
 */
export function VersaoDoContrato({ codigo, bodyHtml, mostrarEtiqueta, className, style, classeCorpo, antes, depois }: VersaoDoContratoProps) {
  return (
    <section lang={codigo} className={className} style={style}>
      {mostrarEtiqueta && (
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {obterIdioma(codigo)?.nomeNativo ?? codigo}
        </h3>
      )}
      {antes}
      <div className={classeCorpo} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(bodyHtml) }} />
      {depois}
    </section>
  );
}
