/**
 * O PDF do relatório mensal de assiduidade da apresentação: texto simples, uma linha por dia, gerado no navegador
 * com a biblioteca `pdf-lib`. Não há logótipo, tabela nem fontes à medida: serve para mostrar o botão a funcionar.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const LINHAS_POR_PAGINA = 40;

export interface DadosRelatorioPdf {
  titulo: string;
  subtitulo: string;
  linhas: string[];
}

/** O PDF do mês, como bytes. A primeira página leva o título; cada página leva no máximo `LINHAS_POR_PAGINA` linhas. */
export async function gerarPdfRelatorioMensal(args: DadosRelatorioPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const grupos: string[][] = [];
  for (let i = 0; i < args.linhas.length; i += LINHAS_POR_PAGINA) grupos.push(args.linhas.slice(i, i + LINHAS_POR_PAGINA));
  for (const [indice, grupo] of (grupos.length > 0 ? grupos : [[]]).entries()) {
    const pagina = doc.addPage([595, 842]);
    let y = 800;
    if (indice === 0) {
      pagina.drawText(args.titulo, { x: 40, y, size: 16, font: negrito, color: rgb(0, 0, 0) });
      y -= 20;
      pagina.drawText(args.subtitulo, { x: 40, y, size: 10, font: fonte, color: rgb(0.3, 0.3, 0.3) });
      y -= 28;
    }
    for (const linha of grupo) {
      pagina.drawText(linha, { x: 40, y, size: 9, font: fonte, color: rgb(0, 0, 0) });
      y -= 16;
    }
  }
  return doc.save();
}
