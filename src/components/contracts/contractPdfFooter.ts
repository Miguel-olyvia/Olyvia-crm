// O rodapé (texto + "Página X de Y") do PDF do contrato, desenhado com o jsPDF em TODAS as páginas.
// Com várias versões de idioma, cada página leva o rodapé da sua versão e a numeração no idioma dessa página
// («Página 3 de 5» / «Page 4 of 5»); o total e a numeração são contínuos, do documento inteiro.

import { IDIOMA_BASE, paginaXdeY } from "@/lib/idiomaDocumento";

/** Corpo de letra (pt) do rodapé desenhado pelo jsPDF. */
const FOOTER_FONT_PT = 9;
const PT_TO_MM = 25.4 / 72;
/** Espaço em branco (mm) entre o rodapé e o limite físico da folha. */
const FOOTER_BOTTOM_PADDING_MM = 4;
/** Espaço em branco (mm) entre o texto do rodapé e a numeração. */
const FOOTER_PAGE_NUM_GAP_MM = 2.5;
/** Espaço em branco (mm) entre o divisor e a primeira linha do rodapé. */
const FOOTER_DIVIDER_GAP_MM = 2;
/** Folga (mm) entre o fim do conteúdo e o divisor do rodapé. */
const FOOTER_CONTENT_CLEARANCE_MM = 4;

export interface ContractFooterLayout {
  showFooterText: boolean;
  showPageNumbers: boolean;
  /** Texto do rodapé já partido nas linhas que cabem na largura útil. */
  textLines: string[];
  lineHeightMm: number;
  /** Margem inferior mínima que a paginação tem de respeitar. */
  reservedMm: number;
}

/** As páginas (a contar de 1) de uma versão de idioma e as definições com que o seu rodapé se desenha. */
export interface ContractFooterGroup {
  codigo: string;
  settings: Record<string, any>;
  firstPage: number;
  lastPage: number;
  layout?: ContractFooterLayout;
}

/**
 * Calcula, a partir das definições do documento, quanto espaço o rodapé ocupa.
 * Feito ANTES da paginação: o conteúdo tem de parar acima desta zona.
 *
 * `pdf` é usado só para medir a quebra de linha do texto do rodapé com a mesma
 * fonte com que ele vai ser desenhado.
 */
export function computeFooterLayout(settings: Record<string, any>, pdf: any): ContractFooterLayout {
  const showFooter = settings.show_footer !== false;
  const footerText = String(settings.footer_text || "");
  const showFooterText = showFooter && footerText.length > 0;
  const showPageNumbers = showFooter && settings.show_page_numbers !== false;
  const lineHeightMm = FOOTER_FONT_PT * PT_TO_MM * 1.25;

  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const marginLeft = Number(settings.margin_left ?? 20) || 20;
  const marginRight = Number(settings.margin_right ?? 20) || 20;
  const contentWidthMm = Math.max(20, pageWidthMm - marginLeft - marginRight);

  pdf.setFontSize(FOOTER_FONT_PT);
  const textLines: string[] = showFooterText ? pdf.splitTextToSize(footerText, contentWidthMm) : [];

  const reservedMm =
    FOOTER_BOTTOM_PADDING_MM +
    (showPageNumbers ? lineHeightMm + FOOTER_PAGE_NUM_GAP_MM : 0) +
    (showFooterText ? textLines.length * lineHeightMm + FOOTER_DIVIDER_GAP_MM : 0) +
    FOOTER_CONTENT_CLEARANCE_MM;

  return { showFooterText, showPageNumbers, textLines, lineHeightMm, reservedMm };
}

/** Desenha o rodapé em cada página de `firstPage` a `lastPage`, com a numeração no idioma `codigo` e o total dado. */
function drawFooterOnPages(
  pdf: any,
  settings: Record<string, any>,
  layout: ContractFooterLayout,
  codigo: string,
  firstPage: number,
  lastPage: number,
  total: number,
): void {
  if (!layout.showFooterText && !layout.showPageNumbers) return;

  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  const marginLeft = Number(settings.margin_left ?? 20) || 20;
  const marginRight = Number(settings.margin_right ?? 20) || 20;

  const textLines = layout.textLines;
  const textBlockHeightMm = textLines.length * layout.lineHeightMm;

  const pageNumBaselineY = pageHeightMm - FOOTER_BOTTOM_PADDING_MM;
  const textFirstBaselineY =
    (layout.showPageNumbers ? pageNumBaselineY - FOOTER_PAGE_NUM_GAP_MM : pageNumBaselineY) -
    textBlockHeightMm +
    layout.lineHeightMm * 0.85;
  const dividerY = textFirstBaselineY - layout.lineHeightMm * 0.85 - FOOTER_DIVIDER_GAP_MM;

  for (let i = firstPage; i <= lastPage; i++) {
    pdf.setPage(i);
    pdf.setFontSize(FOOTER_FONT_PT);
    pdf.setTextColor(107, 114, 128);

    if (layout.showFooterText) {
      pdf.setDrawColor(229, 231, 235);
      pdf.setLineWidth(0.2);
      pdf.line(marginLeft, dividerY, pageWidthMm - marginRight, dividerY);
      textLines.forEach((line, idx) => {
        pdf.text(line, pageWidthMm / 2, textFirstBaselineY + idx * layout.lineHeightMm, { align: "center" });
      });
    }
    if (layout.showPageNumbers) {
      pdf.text(paginaXdeY(codigo, i, total), pageWidthMm / 2, pageNumBaselineY, { align: "center" });
    }
  }
}

/**
 * Escreve o rodapé (texto + "Página X de Y") em TODAS as páginas do PDF.
 *
 * Substitui o rodapé que era injetado como conteúdo do documento e que, por
 * isso, (a) só aparecia no fim da última página e (b) dizia sempre
 * "Página 1 de 1" — uma constante literal, independente do nº real de páginas.
 * Mesmo padrão já usado no export de minutas (TemplateExportButtons).
 */
export function drawContractPdfFooters(
  pdf: any,
  settings: Record<string, any>,
  layout: ContractFooterLayout = computeFooterLayout(settings, pdf),
): void {
  const total = pdf.getNumberOfPages();
  drawFooterOnPages(pdf, settings, layout, IDIOMA_BASE, 1, total, total);
}

/**
 * O mesmo, para um documento com várias versões de idioma: cada grupo traz as suas páginas, as suas definições
 * (rodapé próprio) e o idioma da numeração. O total é o do documento inteiro e a numeração é contínua.
 */
export function drawContractPdfFootersByVersion(pdf: any, grupos: readonly ContractFooterGroup[]): void {
  const total = pdf.getNumberOfPages();
  for (const grupo of grupos) {
    const layout = grupo.layout ?? computeFooterLayout(grupo.settings, pdf);
    drawFooterOnPages(pdf, grupo.settings, layout, grupo.codigo, grupo.firstPage, Math.min(grupo.lastPage, total), total);
  }
}
