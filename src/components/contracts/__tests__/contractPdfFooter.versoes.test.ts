import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeFooterLayout,
  drawContractPdfFooters,
  drawContractPdfFootersByVersion,
} from "../contractPdfFooter";
import { paginarVersoesNoPdf, paginateWorkerCanvasToPdf, prepararHtmlParaPdf } from "../contractPdfPaginate";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

/** jsPDF mínimo: regista o que foi desenhado e as páginas acrescentadas. */
function makeFakePdf(pageCount = 1) {
  const texts: Array<{ page: number; text: string }> = [];
  const lines: Array<{ page: number }> = [];
  const imagens: Array<{ page: number }> = [];
  let current = 1;
  let paginas = pageCount;
  return {
    texts,
    lines,
    imagens,
    addPage: vi.fn(() => { paginas += 1; current = paginas; }),
    addImage: vi.fn(() => { imagens.push({ page: current }); }),
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    getNumberOfPages: () => paginas,
    setPage: (n: number) => { current = n; },
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    setDrawColor: vi.fn(),
    setLineWidth: vi.fn(),
    line: () => { lines.push({ page: current }); },
    text: (text: string) => { texts.push({ page: current, text }); },
    splitTextToSize: (text: string) => text.split("|"),
  };
}

const numeracao = (pdf: ReturnType<typeof makeFakePdf>) =>
  pdf.texts.filter((t) => /^(Página|Page) /.test(t.text)).map((t) => `${t.page}:${t.text}`);

describe("drawContractPdfFootersByVersion", () => {
  it("numeração contínua do documento inteiro, cada página no idioma da sua versão", () => {
    const pdf = makeFakePdf(4);
    drawContractPdfFootersByVersion(pdf, [
      { codigo: "pt", settings: { footer_text: "Rodapé pt" }, firstPage: 1, lastPage: 3 },
      { codigo: "en", settings: { footer_text: "Footer en" }, firstPage: 4, lastPage: 4 },
    ]);
    expect(numeracao(pdf)).toEqual(["1:Página 1 de 4", "2:Página 2 de 4", "3:Página 3 de 4", "4:Page 4 of 4"]);
  });

  it("o texto do rodapé de cada página é o da sua versão", () => {
    const pdf = makeFakePdf(3);
    drawContractPdfFootersByVersion(pdf, [
      { codigo: "pt", settings: { footer_text: "Rodapé pt" }, firstPage: 1, lastPage: 2 },
      { codigo: "en", settings: { footer_text: "Footer en" }, firstPage: 3, lastPage: 3 },
    ]);
    expect(pdf.texts.filter((t) => t.text === "Rodapé pt").map((t) => t.page)).toEqual([1, 2]);
    expect(pdf.texts.filter((t) => t.text === "Footer en").map((t) => t.page)).toEqual([3]);
    expect(pdf.lines.map((l) => l.page)).toEqual([1, 2, 3]);
  });

  it("uma versão sem rodapé nem numeração não desenha nada nas suas páginas", () => {
    const pdf = makeFakePdf(2);
    drawContractPdfFootersByVersion(pdf, [
      { codigo: "pt", settings: { footer_text: "Rodapé pt" }, firstPage: 1, lastPage: 1 },
      { codigo: "en", settings: { footer_text: "x", show_footer: false }, firstPage: 2, lastPage: 2 },
    ]);
    expect(pdf.texts.filter((t) => t.page === 2)).toEqual([]);
    expect(pdf.texts.filter((t) => t.page === 1).length).toBeGreaterThan(0);
  });

  it("com uma só versão desenha exatamente o mesmo que drawContractPdfFooters", () => {
    const settings = { footer_text: "Empresa, Lda.|segunda linha", margin_left: 25 };
    const a = makeFakePdf(3);
    drawContractPdfFooters(a, settings);
    const b = makeFakePdf(3);
    drawContractPdfFootersByVersion(b, [{ codigo: "pt", settings, firstPage: 1, lastPage: 3 }]);
    expect(b.texts).toEqual(a.texts);
    expect(b.lines).toEqual(a.lines);
  });

  it("não desenha páginas fora do intervalo da versão (versão vazia)", () => {
    const pdf = makeFakePdf(2);
    drawContractPdfFootersByVersion(pdf, [
      { codigo: "pt", settings: { footer_text: "pt" }, firstPage: 1, lastPage: 2 },
      { codigo: "en", settings: { footer_text: "en" }, firstPage: 3, lastPage: 2 },
    ]);
    expect(pdf.texts.filter((t) => t.text === "en")).toEqual([]);
  });
});

describe("computeFooterLayout por idioma", () => {
  it("a margem inferior reservada é o máximo entre os rodapés de todas as versões", () => {
    const pdf = makeFakePdf();
    const curto = computeFooterLayout({ footer_text: "curto" }, pdf);
    const longo = computeFooterLayout({ footer_text: "linha 1|linha 2|linha 3" }, pdf);
    expect(longo.reservedMm).toBeGreaterThan(curto.reservedMm);
    expect(Math.max(curto.reservedMm, longo.reservedMm)).toBe(longo.reservedMm);
  });
});

// ── a paginação: «começar em página nova» e a ordem das versões ─────────────────────────────────

const LARGURA = 800;
const RATIO = 1.414; // altura/largura de uma página útil → 1131 px por página

function fakeWorker(alturaPx: number) {
  return {
    toContainer: vi.fn(async () => {}),
    toCanvas: vi.fn(async () => {}),
    prop: {
      canvas: {
        width: LARGURA,
        height: alturaPx,
        getContext: () => ({
          getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) }),
        }),
      },
      pageSize: { inner: { ratio: RATIO, width: 170 } },
    },
  };
}

describe("paginateWorkerCanvasToPdf — começar em página nova", () => {
  afterEach(() => vi.restoreAllMocks());

  function silenciarCanvas() {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,AA==");
  }

  it("por omissão a primeira fatia vai para a página já existente, sem acrescentar nenhuma", async () => {
    silenciarCanvas();
    const pdf = makeFakePdf(1);
    await paginateWorkerCanvasToPdf(fakeWorker(1000), pdf, { marginTop: 20, marginLeft: 20 });
    expect(pdf.addPage).not.toHaveBeenCalled();
    expect(pdf.imagens).toEqual([{ page: 1 }]);
  });

  it("com «começar em página nova» a primeira fatia abre uma página", async () => {
    silenciarCanvas();
    const pdf = makeFakePdf(1);
    await paginateWorkerCanvasToPdf(fakeWorker(1000), pdf, { marginTop: 20, marginLeft: 20 }, true);
    expect(pdf.addPage).toHaveBeenCalledTimes(1);
    expect(pdf.imagens).toEqual([{ page: 2 }]);
  });

  it("uma versão de várias páginas continua a abrir uma página por fatia", async () => {
    silenciarCanvas();
    const pdf = makeFakePdf(1);
    await paginateWorkerCanvasToPdf(fakeWorker(2500), pdf, { marginTop: 20, marginLeft: 20 });
    expect(pdf.imagens.map((i) => i.page)).toEqual([1, 2, 3]);
    expect(pdf.addPage).toHaveBeenCalledTimes(2);
  });
});

describe("paginarVersoesNoPdf — as versões, uma a seguir à outra", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a 2.ª versão começa sempre numa página nova e devolve o intervalo de páginas de cada uma", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,AA==");
    const pdf = makeFakePdf(1);
    const alturas: Record<string, number> = { pt: 2500, en: 600 };
    const elementos = [document.createElement("div"), document.createElement("div")];
    const grupos = await paginarVersoesNoPdf({
      pdf,
      offsets: { marginTop: 20, marginLeft: 20 },
      paginas: [
        { codigo: "pt", elemento: elementos[0], settings: { footer_text: "pt" } },
        { codigo: "en", elemento: elementos[1], settings: { footer_text: "en" } },
      ],
      criarWorker: (el) => fakeWorker(alturas[el === elementos[0] ? "pt" : "en"]),
    });
    expect(pdf.imagens.map((i) => i.page)).toEqual([1, 2, 3, 4]);
    expect(grupos.map((g) => [g.codigo, g.firstPage, g.lastPage])).toEqual([["pt", 1, 3], ["en", 4, 4]]);
    // o rodapé: numeração contínua e cada página no seu idioma
    drawContractPdfFootersByVersion(pdf, grupos);
    expect(numeracao(pdf)).toEqual(["1:Página 1 de 4", "2:Página 2 de 4", "3:Página 3 de 4", "4:Page 4 of 4"]);
  });

  it("com uma só versão não acrescenta páginas além das da própria versão", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,AA==");
    const pdf = makeFakePdf(1);
    const grupos = await paginarVersoesNoPdf({
      pdf,
      offsets: { marginTop: 20, marginLeft: 20 },
      paginas: [{ codigo: "pt", elemento: document.createElement("div"), settings: {} }],
      criarWorker: () => fakeWorker(1000),
    });
    expect(pdf.addPage).not.toHaveBeenCalled();
    expect(grupos).toEqual([{ codigo: "pt", settings: {}, firstPage: 1, lastPage: 1 }]);
  });
});

describe("prepararHtmlParaPdf", () => {
  const HTML = `<!doctype html><html><head><style>.page{width:1px}</style></head><body>
    <div class="page"><div class="content"><p>Versão pt</p></div><div class="footer"><p>Rodapé pt</p></div></div>
    <div class="page" style="break-before:page;page-break-before:always"><div class="content"><p>Versão en</p></div><div class="footer"><p>Footer en</p></div></div>
    <script>window.print()</script></body></html>`;

  it("tira os scripts e o rodapé do corpo, mas deixa uma .page por versão", () => {
    const saida = new DOMParser().parseFromString(prepararHtmlParaPdf(HTML), "text/html");
    expect(saida.querySelectorAll("script")).toHaveLength(0);
    expect(saida.querySelectorAll(".footer")).toHaveLength(0);
    const paginas = Array.from(saida.querySelectorAll(".page"));
    expect(paginas.map((p) => p.textContent?.trim())).toEqual(["Versão pt", "Versão en"]);
  });

  it("tira a quebra de página das .page: o PDF abre a página nova na paginação (sem página em branco)", () => {
    const saida = prepararHtmlParaPdf(HTML);
    expect(saida).not.toContain("break-before");
    expect(saida).not.toContain("page-break-before");
    expect(saida.startsWith("<!doctype html>")).toBe(true);
  });

  it("não deixa wrappers olv-versao no documento do PDF (o fixture TEM wrappers)", () => {
    const comWrappers = HTML.replace(
      '<div class="content"><p>Versão en</p></div>',
      '<div class="content"><div class="olv-versao olv-versao-en"><p>Versão en</p></div></div>',
    );
    expect(comWrappers).toContain("olv-versao-en");
    const saida = prepararHtmlParaPdf(comWrappers);
    expect(saida).not.toContain("olv-versao");
    expect(saida).toContain("Versão en");
  });
});
