import { describe, expect, it } from "vitest";
import { calcularBaseHash, calcularCompletude, calcularBaseHashDoTemplate } from "../completude";

describe("calcularBaseHash", () => {
  it("é determinístico e curto (8 caracteres hexadecimais)", () => {
    const a = calcularBaseHash("<p>Contrato de prestação de serviços</p>");
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(calcularBaseHash("<p>Contrato de prestação de serviços</p>")).toBe(a);
  });

  it("muda quando o texto muda, por pouco que seja", () => {
    expect(calcularBaseHash("<p>a</p>")).not.toBe(calcularBaseHash("<p>b</p>"));
    expect(calcularBaseHash("texto")).not.toBe(calcularBaseHash("texto "));
  });

  it("valores conhecidos (FNV-1a de 32 bits)", () => {
    expect(calcularBaseHash("")).toBe("811c9dc5");
    expect(calcularBaseHash("a")).toBe("e40c292c");
  });

  it("aguenta unicode e texto nulo", () => {
    expect(calcularBaseHash("Março — ção 😀")).toMatch(/^[0-9a-f]{8}$/);
    expect(calcularBaseHash(null)).toBe("811c9dc5");
    expect(calcularBaseHash(undefined)).toBe("811c9dc5");
  });
});

function minuta() {
  return {
    body_html: "<h2>CONTRATO</h2><p>Texto em português</p>",
    doc_settings: {
      footer_text: "Rodapé pt",
      quote_items_title: "Artigos do Orçamento",
      contract_block_title: "CONTRATO",
      contract_block_number_label: "CONTRATO Nº",
      versions: {
        en: {
          body_html: "<h2>AGREEMENT</h2><p>English text</p>",
          header: { contract_block_title: "AGREEMENT", contract_block_number_label: "AGREEMENT No." },
          footer_text: "English footer",
          quote_items_title: "Quote items",
        },
      },
    },
  };
}

describe("calcularCompletude — contrato", () => {
  it("versão completa: nada falta", () => {
    const c = calcularCompletude(minuta(), "en");
    expect(c.codigo).toBe("en");
    expect(c.completo).toBe(true);
    expect(c.faltam).toEqual([]);
    expect(c.desatualizado).toBe(false);
  });

  it("o idioma base está sempre completo", () => {
    expect(calcularCompletude(minuta(), "pt")).toEqual({ codigo: "pt", completo: true, faltam: [], desatualizado: false });
  });

  it("vazio conta como em falta", () => {
    const t = minuta();
    t.doc_settings.versions.en.footer_text = "   ";
    delete (t.doc_settings.versions.en.header as any).contract_block_number_label;
    expect(calcularCompletude(t, "en").faltam.sort()).toEqual(["footer_text", "header.contract_block_number_label"]);
  });

  it("igual ao português (sem tags) conta como em falta", () => {
    const t = minuta();
    t.doc_settings.versions.en.body_html = "<div><h2>CONTRATO</h2></div><p>Texto em   português</p>";
    t.doc_settings.versions.en.quote_items_title = "Artigos do Orçamento";
    const c = calcularCompletude(t, "en");
    expect(c.completo).toBe(false);
    expect(c.faltam.sort()).toEqual(["body_html", "quote_items_title"]);
  });

  it("só exige o que o base tem: rodapé e rótulos vazios no base não pedem tradução", () => {
    const t = { body_html: "<p>Texto</p>", doc_settings: { versions: { en: { body_html: "<p>Text</p>" } } } };
    expect(calcularCompletude(t, "en")).toEqual({ codigo: "en", completo: true, faltam: [], desatualizado: false });
  });

  it("versão inexistente: falta tudo o que o base tem", () => {
    const c = calcularCompletude(minuta(), "es");
    expect(c.completo).toBe(false);
    expect(c.faltam.sort()).toEqual([
      "body_html",
      "footer_text",
      "header.contract_block_number_label",
      "header.contract_block_title",
      "quote_items_title",
    ]);
  });

  it("base_hash diferente do hash atual do português: desatualizado", () => {
    const t = minuta();
    (t.doc_settings.versions.en as any).base_hash = calcularBaseHashDoTemplate(t);
    expect(calcularCompletude(t, "en").desatualizado).toBe(false);
    t.body_html = "<h2>CONTRATO</h2><p>Texto em português ALTERADO</p>";
    expect(calcularCompletude(t, "en").desatualizado).toBe(true);
  });

  it("sem base_hash na versão não há aviso", () => {
    expect(calcularCompletude(minuta(), "en").desatualizado).toBe(false);
  });

  it("template nulo não rebenta", () => {
    expect(calcularCompletude(null, "en").completo).toBe(false);
  });
});

function proposta() {
  return {
    header_text: "Cabeçalho pt",
    footer_text: "Rodapé pt",
    terms_conditions: "<p>Termos pt</p>",
    thank_you_message: "",
    sections: [
      { id: "header", type: "header", label: "Cabeçalho", visible: true, settings: { customTitle: "PROPOSTA" } },
      { id: "terms", type: "terms", label: "Condições Gerais", visible: true, settings: { sectionLabel: "CONDIÇÕES GERAIS" } },
      { id: "custom_1", type: "custom", label: "Garantia", visible: true, settings: { content: "<p>Garantia</p>" } },
      { id: "oculta", type: "notes", label: "Notas", visible: false, settings: { sectionLabel: "NOTAS" } },
    ],
    design_settings: {
      accept_button_text: "Aceitar Proposta",
      versions: {
        en: {
          header_text: "Header",
          footer_text: "Footer",
          terms_conditions: "<p>Terms</p>",
          accept_button_text: "Accept",
          sections: {
            header: { customTitle: "PROPOSAL" },
            terms: { sectionLabel: "GENERAL TERMS" },
            custom_1: { label: "Warranty", content: "<p>Warranty</p>" },
          },
        },
      },
    },
  };
}

describe("calcularCompletude — proposta", () => {
  it("versão completa: nada falta (campos vazios no base não contam; secções ocultas também não)", () => {
    const c = calcularCompletude(proposta(), "en");
    expect(c.faltam).toEqual([]);
    expect(c.completo).toBe(true);
  });

  it("deteta textos em falta e iguais ao base", () => {
    const t = proposta();
    t.design_settings.versions.en.footer_text = "Rodapé pt";
    delete (t.design_settings.versions.en as any).terms_conditions;
    delete (t.design_settings.versions.en as any).accept_button_text;
    expect(calcularCompletude(t, "en").faltam.sort()).toEqual(["accept_button_text", "footer_text", "terms_conditions"]);
  });

  it("deteta títulos de secção por traduzir", () => {
    const t = proposta();
    (t.design_settings.versions.en as any).sections = { header: { customTitle: "PROPOSTA" }, terms: {}, custom_1: { label: "Warranty" } };
    expect(calcularCompletude(t, "en").faltam.sort()).toEqual([
      "sections.custom_1.content",
      "sections.header.customTitle",
      "sections.terms.sectionLabel",
    ]);
  });

  it("o base_hash da proposta acompanha os textos do base", () => {
    const t = proposta();
    (t.design_settings.versions.en as any).base_hash = calcularBaseHashDoTemplate(t);
    expect(calcularCompletude(t, "en").desatualizado).toBe(false);
    t.header_text = "Cabeçalho pt mudou";
    expect(calcularCompletude(t, "en").desatualizado).toBe(true);
  });
});
