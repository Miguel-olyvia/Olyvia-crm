// Desenha o PDF de exemplo (uma página A4, com a biblioteca pdf-lib que o projeto já tem) e descarrega-o por um
// Blob e uma ligação temporária. A biblioteca só se carrega ao primeiro clique. Nada vai para fora do navegador.
import type { ConteudoPdf } from "./pdfDocumento";

const LARGURA = 595.28;
const ALTURA = 841.89;
const MARGEM = 56;
const COLUNA_VALOR = MARGEM + 150;
const LIMITE_INFERIOR = 90;
const MAX_CARACTERES = 80;

/** A fonte padrão do PDF só tem Latin-1 e €: o resto passa a "?" e qualquer espaço (também o fino e o duro) a espaço. */
export function textoSeguro(texto: string): string {
  const limpo = texto.replace(/\s+/g, " ").replace(/[^\x20-\x7E\xA0-\xFF€]/g, "?");
  return limpo.length > MAX_CARACTERES ? `${limpo.slice(0, MAX_CARACTERES - 3)}...` : limpo;
}

/** Gera os bytes de um PDF de 1 página com o título, os campos, as linhas e o rodapé. */
export async function gerarBytesPdf(conteudo: ConteudoPdf): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const pagina = pdf.addPage([LARGURA, ALTURA]);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const cinza = rgb(0.35, 0.35, 0.4);
  const preto = rgb(0.08, 0.08, 0.1);
  let y = ALTURA - MARGEM - 8;

  pagina.drawText(textoSeguro(conteudo.titulo), { x: MARGEM, y, size: 22, font: negrito, color: preto });
  y -= 14;
  pagina.drawLine({ start: { x: MARGEM, y }, end: { x: LARGURA - MARGEM, y }, thickness: 1, color: cinza });
  y -= 30;
  for (const campo of conteudo.campos) {
    if (y < LIMITE_INFERIOR) break;
    pagina.drawText(textoSeguro(campo.rotulo), { x: MARGEM, y, size: 11, font: negrito, color: cinza });
    pagina.drawText(textoSeguro(campo.valor), { x: COLUNA_VALOR, y, size: 12, font: normal, color: preto });
    y -= 22;
  }
  if (conteudo.linhas.length > 0) {
    y -= 12;
    pagina.drawText(textoSeguro(conteudo.tituloLinhas), { x: MARGEM, y, size: 12, font: negrito, color: preto });
    y -= 22;
    for (const linha of conteudo.linhas) {
      if (y < LIMITE_INFERIOR) break;
      pagina.drawText(textoSeguro(linha.descricao), { x: MARGEM, y, size: 11, font: normal, color: preto });
      pagina.drawText(textoSeguro(linha.valor), { x: COLUNA_VALOR + 150, y, size: 11, font: normal, color: preto });
      y -= 18;
    }
  }
  pagina.drawText(textoSeguro(conteudo.rodape), { x: MARGEM, y: MARGEM - 10, size: 9, font: normal, color: cinza });
  return pdf.save();
}

/** Descarrega os bytes como ficheiro, com um Blob e uma ligação temporária que se remove logo a seguir. */
export function descarregarPdf(bytes: Uint8Array, nome: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const ligacao = document.createElement("a");
  ligacao.href = url;
  ligacao.download = nome;
  ligacao.rel = "noopener";
  document.body.appendChild(ligacao);
  ligacao.click();
  ligacao.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
