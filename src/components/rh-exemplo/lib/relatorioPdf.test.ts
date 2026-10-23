import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { LINHAS_POR_PAGINA, gerarPdfRelatorioMensal } from "@/components/rh-exemplo/lib/relatorioPdf";

const comoTexto = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes.slice(0, 8));

describe("relatório mensal em PDF", () => {
  it("gera um PDF válido com uma página para poucos dias", async () => {
    const bytes = await gerarPdfRelatorioMensal({ titulo: "Relatório", subtitulo: "Rui Amaral", linhas: ["2026-10-01 Normal", "2026-10-02 Normal"] });
    expect(comoTexto(bytes)).toContain("%PDF");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("sem linhas continua a devolver uma página (só o título)", async () => {
    const bytes = await gerarPdfRelatorioMensal({ titulo: "Relatório", subtitulo: "", linhas: [] });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("parte em páginas quando passa do limite por página", async () => {
    const linhas = Array.from({ length: LINHAS_POR_PAGINA * 2 + 1 }, (_, i) => `linha ${i}`);
    const bytes = await gerarPdfRelatorioMensal({ titulo: "Relatório", subtitulo: "x", linhas });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3);
  });

  it("aceita acentos e caracteres comuns em português, e recusa o que a fonte base não tem", async () => {
    const bytes = await gerarPdfRelatorioMensal({ titulo: "Relatório mensal — Outubro", subtitulo: "João Gonçalves · Ausência", linhas: ["Férias · 22 dias"] });
    expect(bytes.length).toBeGreaterThan(500);
    await expect(gerarPdfRelatorioMensal({ titulo: "😀", subtitulo: "", linhas: [] })).rejects.toThrow();
  });
});
