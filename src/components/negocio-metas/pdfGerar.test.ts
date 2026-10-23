// @vitest-environment node
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { gerarBytesPdf, textoSeguro } from "./pdfGerar";
import type { ConteudoPdf } from "./pdfDocumento";

describe("textoSeguro", () => {
  it("mantém acentos e o euro, e troca o que a fonte do PDF não tem por ?", () => {
    expect(textoSeguro("Serviço: Remodelação € 8.600")).toBe("Serviço: Remodelação € 8.600");
    expect(textoSeguro("Ana ✓ 日本")).toBe("Ana ? ??");
  });

  it("passa qualquer espaço (também o duro e o fino) e quebras de linha a um espaço", () => {
    expect(textoSeguro("a b c\nd")).toBe("a b c d");
  });

  it("corta um texto muito comprido", () => {
    const cortado = textoSeguro("x".repeat(200));
    expect(cortado).toHaveLength(80);
    expect(cortado.endsWith("...")).toBe(true);
  });
});

describe("gerarBytesPdf", () => {
  const conteudo: ConteudoPdf = {
    titulo: "Orçamento (minuta)", minuta: true,
    campos: [{ rotulo: "Pessoa", valor: "Nuno Barros" }, { rotulo: "Valor", valor: "€8.600" }],
    tituloLinhas: "Linhas do orçamento", linhas: [{ descricao: "Janelas (exemplo)", valor: "€8.600" }],
    rodape: "Documento de exemplo.",
  };

  it("devolve um PDF de uma página", async () => {
    const bytes = await gerarBytesPdf(conteudo);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("aguenta texto com caracteres que a fonte não tem e sem linhas", async () => {
    const bytes = await gerarBytesPdf({ ...conteudo, titulo: "日本 ✓", linhas: [] });
    expect(bytes.length).toBeGreaterThan(500);
  });
});
