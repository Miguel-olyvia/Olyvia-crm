// Paginação do PDF do contrato: fatia o canvas do html2pdf em páginas e junta as versões de idioma, uma a seguir
// à outra (a 2.ª versão e as seguintes começam sempre numa página nova).

import type { ContractFooterGroup } from "./contractPdfFooter";

/**
 * Fatia o canvas do html2pdf em páginas, cortando sempre numa faixa sem tinta.
 *
 * Porquê não usar o `toPdf()` do html2pdf: a paginação dele acontece em dois
 * sítios que não concordam entre si. O plugin `pagebreak` insere os "pads" com
 * base no layout do DOM vivo, mas o `toPdf()` corta o canvas produzido pelo
 * html2canvas — e o html2canvas re-faz o layout num clone, com diferenças de
 * alguns pixéis. Onde um bloco acaba encostado ao limite da página, esse desvio
 * chega para a última linha ficar partida ao meio: metade no fundo de uma
 * página, metade no topo da seguinte (medido: 317 pixéis com tinta exatamente
 * na linha de corte do CC-2026-0011).
 *
 * Aqui o corte é decidido sobre os pixéis que vão mesmo para o PDF: procura-se,
 * a partir da altura nominal e para cima, a primeira linha de pixéis sem tinta.
 * Isto é indiferente à causa do desvio e cobre também texto solto e blocos que
 * o `pagebreak.avoid` não protege.
 *
 * `startOnNewPage`: a primeira fatia abre uma página nova em vez de ir para a página corrente do PDF
 * (as versões de idioma a seguir à primeira começam sempre numa página nova).
 */
export async function paginateWorkerCanvasToPdf(
  worker: any,
  pdf: any,
  offsets: { marginTop: number; marginLeft: number },
  startOnNewPage: boolean = false,
): Promise<void> {
  await worker.toContainer();
  await worker.toCanvas();

  const canvas: HTMLCanvasElement = worker.prop.canvas;
  const pageSize = worker.prop.pageSize;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  const pxPageHeight = Math.max(1, Math.floor(canvas.width * pageSize.inner.ratio));
  const mmPerPx = pageSize.inner.width / canvas.width;

  const pageCanvas = document.createElement("canvas");
  pageCanvas.width = canvas.width;
  const pageContext = pageCanvas.getContext("2d");

  let top = 0;
  let isFirstPage = true;
  while (top < canvas.height) {
    const nominalCut = Math.min(top + pxPageHeight, canvas.height);
    const cut =
      nominalCut >= canvas.height
        ? canvas.height
        : findInkFreeCut(context, canvas.width, top, nominalCut, pxPageHeight);
    const sliceHeight = cut - top;
    if (sliceHeight <= 0) break;

    pageCanvas.height = sliceHeight;
    if (pageContext) {
      pageContext.fillStyle = "#ffffff";
      pageContext.fillRect(0, 0, canvas.width, sliceHeight);
      pageContext.drawImage(canvas, 0, top, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
    }

    if (!isFirstPage || startOnNewPage) pdf.addPage();
    pdf.addImage(
      pageCanvas.toDataURL("image/jpeg", 0.98),
      "JPEG",
      offsets.marginLeft,
      offsets.marginTop,
      pageSize.inner.width,
      sliceHeight * mmPerPx,
    );

    isFirstPage = false;
    top = cut;
  }
}

/** Fração máxima de uma página que se aceita perder para fugir de uma linha de texto. */
const INK_SCAN_FRACTION = 0.14;
/** Um pixel conta como "tinta" abaixo deste valor em qualquer canal. */
const INK_THRESHOLD = 235;

/**
 * Devolve a maior altura <= `nominalCut` cuja linha de pixéis não tem tinta.
 * Se não houver nenhuma dentro da janela de procura, devolve `nominalCut`
 * (cortar no sítio nominal é melhor do que produzir uma página vazia).
 */
function findInkFreeCut(
  context: CanvasRenderingContext2D | null,
  width: number,
  top: number,
  nominalCut: number,
  pxPageHeight: number,
): number {
  if (!context) return nominalCut;
  const maxScan = Math.min(Math.round(pxPageHeight * INK_SCAN_FRACTION), nominalCut - top - 1);
  if (maxScan <= 0) return nominalCut;

  let band: ImageData;
  try {
    band = context.getImageData(0, nominalCut - maxScan, width, maxScan);
  } catch {
    // Canvas contaminado por imagem cross-origin: sem leitura de pixéis,
    // mantém-se o corte nominal.
    return nominalCut;
  }

  for (let row = maxScan - 1; row >= 0; row--) {
    let hasInk = false;
    for (let x = 0; x < width; x++) {
      const offset = (row * width + x) * 4;
      if (
        band.data[offset] < INK_THRESHOLD ||
        band.data[offset + 1] < INK_THRESHOLD ||
        band.data[offset + 2] < INK_THRESHOLD
      ) {
        hasInk = true;
        break;
      }
    }
    if (!hasInk) return nominalCut - maxScan + row;
  }
  return nominalCut;
}

/**
 * O html de impressão pronto para o PDF: sem scripts; sem o rodapé do corpo (é desenhado por página com o jsPDF,
 * no idioma de cada uma); e sem a quebra de página das `.page` seguintes à primeira — o PDF abre a página nova
 * na paginação, e um `break-before` na própria raiz que o html2pdf clona arriscava uma página em branco antes
 * de cada versão.
 */
export function prepararHtmlParaPdf(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed.querySelectorAll("script").forEach((script) => script.remove());
  parsed.querySelectorAll(".footer").forEach((node) => node.remove());
  parsed.querySelectorAll(".page").forEach((pagina) => pagina.removeAttribute("style"));
  return `<!doctype html>${parsed.documentElement.outerHTML}`;
}

/** Uma `.page` do documento de impressão (uma por versão de idioma) pronta a ir para o PDF. */
export interface PaginaParaPdf {
  codigo: string;
  elemento: HTMLElement;
  settings: Record<string, any>;
}

/**
 * Gera o canvas de cada versão (pela ordem) e fatia-o no PDF. A 1.ª versão usa a página que o PDF já tem; as
 * seguintes começam numa página nova. Devolve, por versão, o intervalo de páginas que ficou com ela — é o que
 * o rodapé precisa para escrever cada página no seu idioma, com a numeração contínua.
 */
export async function paginarVersoesNoPdf(opcoes: {
  pdf: any;
  offsets: { marginTop: number; marginLeft: number };
  paginas: readonly PaginaParaPdf[];
  criarWorker: (elemento: HTMLElement) => any;
}): Promise<ContractFooterGroup[]> {
  const { pdf, offsets, paginas, criarWorker } = opcoes;
  const grupos: ContractFooterGroup[] = [];
  for (let i = 0; i < paginas.length; i += 1) {
    const pagina = paginas[i];
    const antes: number = pdf.getNumberOfPages();
    await paginateWorkerCanvasToPdf(criarWorker(pagina.elemento), pdf, offsets, i > 0);
    const depois: number = pdf.getNumberOfPages();
    grupos.push({
      codigo: pagina.codigo,
      settings: pagina.settings,
      firstPage: i === 0 ? 1 : antes + 1,
      lastPage: depois,
    });
  }
  return grupos;
}
