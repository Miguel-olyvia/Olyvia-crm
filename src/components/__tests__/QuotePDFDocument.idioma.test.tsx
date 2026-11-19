// O QuotePDFDocument fala o idioma de documentContext.idioma (português por omissão). Só as palavras mudam:
// o dinheiro (€ + toFixed(2)), as datas numéricas e os textos dos dados ficam como sempre.
import { describe, expect, it } from "vitest";
import { PT_PDF_BASELINE } from "./QuotePDFDocument.pt-baseline";
import { cenariosPdf, linhasVariasSeccoes, modeloCompleto, renderPdf, serializarArvore, sha1, textoDoPdf } from "./QuotePDFDocument.fixtures";

const nomes = Object.keys(cenariosPdf);

const comIdioma = (nome: string, idioma?: string) => {
  const props = cenariosPdf[nome];
  const ctx = (props.documentContext as Record<string, unknown> | undefined) ?? { kind: "quote" };
  return { ...props, documentContext: idioma === undefined ? props.documentContext : { ...ctx, idioma } };
};

describe("QuotePDFDocument - sem idioma é o português de sempre", () => {
  it("há um baseline para cada cenário", () => {
    expect(Object.keys(PT_PDF_BASELINE).sort()).toEqual([...nomes].sort());
  });

  it.each(nomes)("%s: texto e árvore iguais aos de antes", (nome) => {
    const arvore = renderPdf(cenariosPdf[nome]);
    expect(textoDoPdf(arvore)).toBe(PT_PDF_BASELINE[nome].texto);
    expect(sha1(serializarArvore(arvore))).toBe(PT_PDF_BASELINE[nome].arvore);
  });

  it.each(nomes)("%s: idioma pt dá exatamente o mesmo", (nome) => {
    const arvore = renderPdf(comIdioma(nome, "pt"));
    expect(textoDoPdf(arvore)).toBe(PT_PDF_BASELINE[nome].texto);
    expect(sha1(serializarArvore(arvore))).toBe(PT_PDF_BASELINE[nome].arvore);
  });

  it("um idioma sem dicionário (fr) usa as palavras do português", () => {
    expect(textoDoPdf(renderPdf(comIdioma("propostaModelo", "fr")))).toBe(PT_PDF_BASELINE.propostaModelo.texto);
  });
});

describe("QuotePDFDocument - inglês", () => {
  const texto = (nome: string, extra: Record<string, unknown> = {}) =>
    textoDoPdf(renderPdf({ ...comIdioma(nome, "en"), ...extra }));

  it("proposta com modelo completo: palavras em inglês, valores e datas como sempre", () => {
    const t = texto("propostaModelo");
    expect(t).toContain("PROPOSAL");
    expect(t).toContain("P-2026-001");
    expect(t).toContain("Date: 05/03/2026");
    expect(t).toContain("COMPANY");
    expect(t).toContain("CUSTOMER");
    expect(t).toContain("NOTES");
    expect(t).toContain("PROPOSAL DETAILS");
    expect(t).toContain("VALIDITY");
    expect(t).toContain("This quote is valid for 30 days from the date of issue.");
    expect(t).toContain("PROPOSAL VALUE");
    expect(t).toContain("GENERAL TERMS");
    expect(t).toContain("Name:Ana Silva");
    expect(t).toContain("Phone:910000000");
    expect(t).toContain("Address:Rua A, 1, 1000-001, Lisboa");
    expect(t).toContain("Tax address:Rua B, 2, 4000-001, Porto");
    expect(t).toContain("Delivery address:Rua da Obra, 3");
    expect(t).toContain("DescriptionUnitQty.Unit priceVATTotal");
    expect(t).toContain("Products subtotal (excl. VAT):");
    expect(t).toContain("Global discount (10%):");
    expect(t).toContain("Service fees (VAT 23%):");
    expect(t).toContain("SUBTOTAL (excl. VAT):");
    expect(t).toContain("VAT 23%:");
    expect(t).toContain("Total VAT:");
    expect(t).toContain("GRAND TOTAL (incl. VAT):");
    expect(t).toContain("CONTACT");
  });

  it("o dinheiro e os números mantêm o formato de sempre (€ e duas casas com ponto)", () => {
    const pt = PT_PDF_BASELINE.propostaModelo.texto;
    const en = texto("propostaModelo");
    const dinheiro = (s: string) => s.match(/-?€\d+\.\d{2}/g);
    expect(dinheiro(en)).toEqual(dinheiro(pt));
    expect(en).toContain("€1000.00");
    expect(en).not.toContain("1,000.00");
  });

  it("nada do português de interface fica nas palavras fixas", () => {
    const t = texto("propostaModelo", { proposalTemplate: null });
    // («Descrição» fica de fora: o fixture tem uma descrição de artigo escrita em português, que é dado.)
    expect(t).not.toMatch(/Unid\.|Qtd\.|P\. Unit|Subtotal Produtos|IVA Total|TOTAL GERAL|Desconto Global|Taxas de Serviço|Telefone|Morada|Nome:|válido|CLIENTE|NOTAS|CONDIÇÕES|VALIDADE|DETALHES|Data:/);
  });

  it("os textos dos dados não se traduzem", () => {
    const t = texto("propostaSeccoes");
    expect(t).toContain("Artigo a");
    expect(t).toContain("Cozinha"); // nome de secção vindo dos dados
    expect(t).toContain("Montagem"); // componente do bundle
    expect(t).toContain("Deslocação"); // taxa escrita pela organização
    expect(t).toContain("Nota ao cliente");
    expect(t).toContain("Cabeçalho da organização");
    expect(t).toContain("Pagamento a 30 dias");
    expect(t).toContain("Garantia de 2 anos");
    expect(t).toContain("Mudelar Lda");
  });

  it("linhas de bundle e características em inglês", () => {
    const t = texto("propostaSeccoes");
    expect(t).toContain("Bundle components:");
    expect(texto("propostaModelo")).toContain("Selected features:");
    expect(t).toContain("Bundle without saved component details.");
    expect(t).toContain("SKU: T-1 · Qty: 2.00 · Unit price: €40.00"); // quantidade do componente × 2 da linha
    expect(t).toContain("VAT 6%");
    expect(t).toContain("Mixed");
    expect(t).toContain("General"); // secção por omissão quando a linha não tem nome
    expect(t).not.toContain("Mista");
    expect(t).not.toContain("Geral");
  });

  it("taxas sem nome e com várias taxas de IVA", () => {
    const t = texto("propostaTaxas");
    expect(t).toContain("Service fees:");
    expect(t).toContain("Fee:€5.00");
  });

  it("sem modelo, os rótulos por omissão seguem o idioma", () => {
    const t = texto("propostaPadrao", { quote: { ...(cenariosPdf.propostaPadrao.quote as object), conditions: "Pagamento a 30 dias" } });
    expect(t).toContain("PROPOSAL");
    expect(t).toContain("CUSTOMER");
    expect(t).toContain("NOTES");
    expect(t).toContain("PROPOSAL DETAILS");
    expect(t).toContain("GENERAL TERMS");
  });

  it("rótulos de fábrica em português gravados no modelo traduzem-se; os escritos pela organização ficam", () => {
    const modelo = {
      ...modeloCompleto,
      sections: modeloCompleto.sections.map((s) =>
        s.id === "n" ? { ...s, settings: { sectionLabel: "OBSERVAÇÕES DA ORGANIZAÇÃO" } } : s,
      ),
    };
    const t = texto("propostaModelo", { proposalTemplate: modelo });
    expect(t).toContain("CUSTOMER"); // «CLIENTE» é o de fábrica
    expect(t).toContain("GENERAL TERMS"); // «CONDIÇÕES GERAIS» também
    expect(t).toContain("OBSERVAÇÕES DA ORGANIZAÇÃO"); // escrito pela organização
  });

  it("o título e os rótulos escritos na versão inglesa do modelo mandam", () => {
    const modelo = {
      ...modeloCompleto,
      sections: modeloCompleto.sections.map((s) =>
        s.id === "h" ? { ...s, settings: { ...s.settings, customTitle: "OFFER" } }
          : s.id === "te" ? { ...s, settings: { sectionLabel: "OUR TERMS" } } : s,
      ),
    };
    const t = texto("propostaModelo", { proposalTemplate: modelo });
    expect(t).toContain("OFFER");
    expect(t).toContain("OUR TERMS");
    expect(t).not.toContain("GENERAL TERMS");
  });

  it("venda direta e orçamento também têm as suas palavras", () => {
    expect(texto("vendaDireta")).toContain("DIRECT SALE");
    expect(texto("vendaDireta")).toContain("DIRECT SALE DETAILS");
    const comValidade = texto("vendaDiretaModelo", { documentContext: { kind: "direct_sale", number: "VD-1", validUntil: "2026-10-15", idioma: "en" } });
    expect(comValidade).toContain("This sales proposal is valid until 15/10/2026.");
    expect(texto("orcamentoPadrao")).toContain("QUOTE");
    expect(texto("orcamentoPadrao")).toContain("QUOTE DETAILS");
  });

  it("sem dados nenhum o rodapé usa o nome em inglês", () => {
    expect(texto("semNada")).toContain("Quote");
  });

  it("linhasVariasSeccoes continua a ter uma linha sem nome de secção (garante o teste do «General»)", () => {
    expect(linhasVariasSeccoes.some((l: any) => !l.section_name)).toBe(true);
  });
});
