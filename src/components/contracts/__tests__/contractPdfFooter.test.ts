import { describe, expect, it, vi } from "vitest";
import { drawContractPdfFooters } from "../contractDocument";

/** jsPDF mínimo: só o suficiente para registar o que foi desenhado. */
function makeFakePdf(pageCount: number) {
  const texts: Array<{ page: number; text: string }> = [];
  const lines: Array<{ page: number }> = [];
  let current = 1;
  return {
    texts,
    lines,
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    getNumberOfPages: () => pageCount,
    setPage: (n: number) => { current = n; },
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    setDrawColor: vi.fn(),
    setLineWidth: vi.fn(),
    line: () => { lines.push({ page: current }); },
    text: (text: string) => { texts.push({ page: current, text }); },
    splitTextToSize: (text: string) => [text],
  };
}

const pageNumbers = (pdf: ReturnType<typeof makeFakePdf>) =>
  pdf.texts.filter((t) => t.text.startsWith("Página")).map((t) => t.text);

describe("drawContractPdfFooters", () => {
  it("numera todas as páginas com o total real, não 'Página 1 de 1'", () => {
    const pdf = makeFakePdf(4);
    drawContractPdfFooters(pdf, { footer_text: "Rodapé" });
    expect(pageNumbers(pdf)).toEqual([
      "Página 1 de 4",
      "Página 2 de 4",
      "Página 3 de 4",
      "Página 4 de 4",
    ]);
  });

  it("escreve o texto do rodapé e o divisor em todas as páginas", () => {
    const pdf = makeFakePdf(3);
    drawContractPdfFooters(pdf, { footer_text: "Empresa, Lda." });
    expect(pdf.texts.filter((t) => t.text === "Empresa, Lda.").map((t) => t.page)).toEqual([1, 2, 3]);
    expect(pdf.lines.map((l) => l.page)).toEqual([1, 2, 3]);
  });

  it("respeita show_page_numbers = false, mantendo o texto do rodapé", () => {
    const pdf = makeFakePdf(3);
    drawContractPdfFooters(pdf, { footer_text: "Empresa, Lda.", show_page_numbers: false });
    expect(pageNumbers(pdf)).toEqual([]);
    expect(pdf.texts.filter((t) => t.text === "Empresa, Lda.")).toHaveLength(3);
  });

  it("não desenha nada quando show_footer = false", () => {
    const pdf = makeFakePdf(3);
    drawContractPdfFooters(pdf, { footer_text: "Empresa, Lda.", show_footer: false });
    expect(pdf.texts).toEqual([]);
    expect(pdf.lines).toEqual([]);
  });

  it("numera as páginas mesmo sem texto de rodapé configurado", () => {
    const pdf = makeFakePdf(2);
    drawContractPdfFooters(pdf, { footer_text: "" });
    expect(pageNumbers(pdf)).toEqual(["Página 1 de 2", "Página 2 de 2"]);
    expect(pdf.lines).toEqual([]);
  });
});
