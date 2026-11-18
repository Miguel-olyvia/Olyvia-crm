// As versões de idioma de um contrato já composto (`contract_body_html` com wrappers olv-versao): dividir o corpo
// em segmentos para o resolver e voltar a juntá-los. Sem marcas (corpo antigo, de uma só língua) é UM segmento e
// o corpo sai tal e qual — o português de hoje.

import { dividirEmVersoes, idiomasDoDocumento, IDIOMA_BASE, type VersaoDoCorpo } from "@/lib/idiomaDocumento";

/** Uma versão do documento pronta a imprimir: o corpo já resolvido (sem wrapper) e as definições dessa língua. */
export interface ContractVersion<S> {
  codigo: string;
  bodyHtml: string;
  settings: S;
}

const ESTILO_NOVA_PAGINA = "break-before:page;page-break-before:always";

export interface CorpoDividido {
  segmentos: VersaoDoCorpo[];
  /** O corpo tinha wrappers olv-versao (e foi mesmo dividido por eles). */
  comMarcas: boolean;
}

/**
 * Divide o corpo pelas marcas olv-versao. Sem marcas fica um só segmento, no idioma do documento quando este
 * é um só (`prompt_values.__idiomas`) e em português caso contrário. As marcas mandam sobre `__idiomas`.
 */
export function dividirCorpoDoContrato(html: string, contrato: unknown): CorpoDividido {
  const divididos = dividirEmVersoes(html);
  const dividiu = divididos.length > 1 || divididos[0].html !== html;
  if (dividiu) {
    // Uma versão em branco (corpo base vazio com a versão inglesa cheia) não é uma página: só cabeçalho.
    const comTexto = divididos.filter((s) => s.html.trim() !== "");
    return { segmentos: comTexto.length > 0 ? comTexto : divididos, comMarcas: true };
  }
  const idiomas = idiomasDoDocumento(contrato as Parameters<typeof idiomasDoDocumento>[0]);
  return { segmentos: [{ codigo: idiomas.length === 1 ? idiomas[0] : IDIOMA_BASE, html }], comMarcas: false };
}

/**
 * O contrato tem versões de idioma (marcas olv-versao no corpo) ou um idioma que não é só o português
 * (`__idiomas`/`language`)? Só estes passam pelo resolver por versões nos ecrãs; os de sempre (sem marcas e em
 * português) continuam a ser mostrados tal e qual como antes.
 */
export function contratoUsaVersoes(html: string, contrato: unknown): boolean {
  if (dividirCorpoDoContrato(html, contrato).comMarcas) return true;
  const idiomas = idiomasDoDocumento(contrato as Parameters<typeof idiomasDoDocumento>[0]);
  return idiomas.length > 1 || idiomas[0] !== IDIOMA_BASE;
}

/** O inverso: com marcas, cada segmento volta ao seu wrapper (a 2.ª e seguintes com quebra de página). */
export function juntarSegmentos(segmentos: readonly VersaoDoCorpo[], comMarcas: boolean): string {
  if (!comMarcas) return segmentos[0]?.html ?? "";
  return segmentos
    .map((s, i) => `<div class="olv-versao olv-versao-${s.codigo}"${i > 0 ? ` style="${ESTILO_NOVA_PAGINA}"` : ""}>${s.html}</div>`)
    .join("\n");
}
