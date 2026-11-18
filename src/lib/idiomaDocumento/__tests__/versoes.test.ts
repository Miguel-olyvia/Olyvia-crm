import { describe, expect, it } from "vitest";
import {
  aplicarVersaoContrato,
  aplicarVersaoProposta,
  sobreposicaoDaVersaoContrato,
  idiomasDisponiveisContrato,
  idiomasDisponiveisProposta,
} from "../versoes";

function minuta() {
  return {
    id: "t1",
    language: "pt",
    body_html: "<h2>CONTRATO</h2><p>{{cliente_nome}}</p>",
    doc_settings: {
      primary_color: "#123456",
      footer_text: "Rodapé em português",
      quote_items_title: "Artigos do Orçamento",
      contract_block_title: "CONTRATO DE OBRAS",
      contract_block_subtitle: "www.mudelar.pt",
      contract_block_number_label: "CONTRATO Nº",
      contract_block_date_label: "Data:",
      contract_block_commercial_label: "Comercial:",
      contract_block_number_value: "{{contrato_numero}}",
      versions: {
        en: {
          body_html: "<h2>SERVICES AGREEMENT</h2><p>{{cliente_nome}}</p>",
          header: { contract_block_title: "SERVICES AGREEMENT", contract_block_number_label: "CONTRACT No." },
          footer_text: "English footer",
          quote_items_title: "Quote items",
          base_hash: "a91f03c2",
        },
      },
    },
  };
}

describe("idiomasDisponiveisContrato", () => {
  it("sem versões: só o idioma base", () => {
    expect(idiomasDisponiveisContrato({ body_html: "<p>x</p>", doc_settings: {} })).toEqual(["pt"]);
    expect(idiomasDisponiveisContrato({ body_html: "<p>x</p>", doc_settings: null })).toEqual(["pt"]);
    expect(idiomasDisponiveisContrato(null)).toEqual(["pt"]);
    expect(idiomasDisponiveisContrato(undefined)).toEqual(["pt"]);
  });

  it("com versão que tem texto: base e depois a versão", () => {
    expect(idiomasDisponiveisContrato(minuta())).toEqual(["pt", "en"]);
  });

  it("uma versão sem texto (vazia, só tags ou só espaços) não conta", () => {
    for (const body of ["", "   ", "<p></p>", "<p>&nbsp;</p>", null, 5]) {
      const t = { body_html: "<p>x</p>", doc_settings: { versions: { en: { body_html: body } } } };
      expect(idiomasDisponiveisContrato(t)).toEqual(["pt"]);
    }
  });

  it("ignora códigos desconhecidos e versões que não são objetos", () => {
    const t = { body_html: "<p>x</p>", doc_settings: { versions: { xx: { body_html: "<p>a</p>" }, en: "texto", es: { body_html: "<p>Hola</p>" } } } };
    expect(idiomasDisponiveisContrato(t)).toEqual(["pt", "es"]);
  });

  it("ordena pelo registo, com o idioma base sempre incluído", () => {
    const t = { language: "en", body_html: "<p>x</p>", doc_settings: { versions: { pt: { body_html: "<p>y</p>" } } } };
    expect(idiomasDisponiveisContrato(t)).toEqual(["pt", "en"]);
  });

  it("a chave do próprio idioma base dentro de versions é ignorada", () => {
    const t = { body_html: "<p>x</p>", doc_settings: { versions: { pt: { body_html: "<p>outro</p>" } } } };
    expect(idiomasDisponiveisContrato(t)).toEqual(["pt"]);
  });

  it("versions que não é objeto é ignorado", () => {
    expect(idiomasDisponiveisContrato({ body_html: "x", doc_settings: { versions: "en" } })).toEqual(["pt"]);
    expect(idiomasDisponiveisContrato({ body_html: "x", doc_settings: { versions: ["en"] } })).toEqual(["pt"]);
  });
});

describe("aplicarVersaoContrato", () => {
  it("idioma base: devolve a MESMA referência", () => {
    const t = minuta();
    expect(aplicarVersaoContrato(t, "pt")).toBe(t);
  });

  it("sem versões: devolve a MESMA referência", () => {
    const t = { body_html: "<p>x</p>", doc_settings: { footer_text: "f" } };
    expect(aplicarVersaoContrato(t, "en")).toBe(t);
    const s = { body_html: "<p>x</p>", doc_settings: null };
    expect(aplicarVersaoContrato(s, "en")).toBe(s);
  });

  it("idioma sem corpo (não oferecido) ou desconhecido: a MESMA referência", () => {
    const t = minuta();
    expect(aplicarVersaoContrato(t, "es")).toBe(t);
    expect(aplicarVersaoContrato(t, "xx")).toBe(t);
    const vazio = { body_html: "<p>x</p>", doc_settings: { versions: { en: { body_html: "" } } } };
    expect(aplicarVersaoContrato(vazio, "en")).toBe(vazio);
  });

  it("aplica corpo, rodapé e título da tabela da versão", () => {
    const r = aplicarVersaoContrato(minuta(), "en");
    expect(r.body_html).toBe("<h2>SERVICES AGREEMENT</h2><p>{{cliente_nome}}</p>");
    expect((r.doc_settings as any).footer_text).toBe("English footer");
    expect((r.doc_settings as any).quote_items_title).toBe("Quote items");
  });

  it("aplica o que a versão traz no cabeçalho", () => {
    const ds = aplicarVersaoContrato(minuta(), "en").doc_settings as any;
    expect(ds.contract_block_title).toBe("SERVICES AGREEMENT");
    expect(ds.contract_block_number_label).toBe("CONTRACT No.");
  });

  it("rótulos do cabeçalho que a versão não traz NÃO ficam em português: caem no dicionário (null)", () => {
    const ds = aplicarVersaoContrato(minuta(), "en").doc_settings as any;
    expect(ds.contract_block_date_label).toBeNull();
    expect(ds.contract_block_commercial_label).toBeNull();
  });

  it("subtítulo ausente na versão NÃO vaza o português: cai em null como os outros rótulos", () => {
    expect((aplicarVersaoContrato(minuta(), "en").doc_settings as any).contract_block_subtitle).toBeNull();
    const t = minuta();
    (t.doc_settings.versions.en.header as any).contract_block_subtitle = "www.mudelar.com";
    expect((aplicarVersaoContrato(t, "en").doc_settings as any).contract_block_subtitle).toBe("www.mudelar.com");
  });

  it("sobreposicaoDaVersaoContrato devolve só o que a versão sobrepõe (e null se não houver versão)", () => {
    const sobre = sobreposicaoDaVersaoContrato(minuta(), "en") as Record<string, unknown>;
    expect(sobre.footer_text).toBe("English footer");
    expect(sobre.contract_block_subtitle).toBeNull();
    expect(sobre.contract_block_title).toBe("SERVICES AGREEMENT");
    expect("primary_color" in sobre).toBe(false);
    expect(sobreposicaoDaVersaoContrato(minuta(), "pt")).toBeNull();
    expect(sobreposicaoDaVersaoContrato(minuta(), "fr")).toBeNull();
  });

  it("rodapé em falta na versão cai no texto base; título da tabela em falta cai no dicionário", () => {
    const t = minuta();
    delete (t.doc_settings.versions.en as any).footer_text;
    delete (t.doc_settings.versions.en as any).quote_items_title;
    const ds = aplicarVersaoContrato(t, "en").doc_settings as any;
    expect(ds.footer_text).toBe("Rodapé em português");
    expect(ds.quote_items_title).toBeNull();
  });

  it("rodapé vazio na versão também cai no base", () => {
    const t = minuta();
    (t.doc_settings.versions.en as any).footer_text = "   ";
    expect((aplicarVersaoContrato(t, "en").doc_settings as any).footer_text).toBe("Rodapé em português");
  });

  it("campos comuns (cores, valores dos blocos) ficam do base", () => {
    const ds = aplicarVersaoContrato(minuta(), "en").doc_settings as any;
    expect(ds.primary_color).toBe("#123456");
    expect(ds.contract_block_number_value).toBe("{{contrato_numero}}");
  });

  it("não muda o original e preserva as restantes chaves do template", () => {
    const t = minuta();
    const antes = JSON.stringify(t);
    const r = aplicarVersaoContrato(t, "en");
    expect(JSON.stringify(t)).toBe(antes);
    expect(r).not.toBe(t);
    expect(r.id).toBe("t1");
    expect((r.doc_settings as any).versions).toEqual(t.doc_settings.versions);
  });

  it("aceita o código em maiúsculas", () => {
    expect(aplicarVersaoContrato(minuta(), "EN").body_html).toContain("SERVICES AGREEMENT");
  });
});

function propostaTemplate() {
  return {
    id: "p1",
    header_text: "Cabeçalho pt",
    footer_text: "Rodapé pt",
    terms_conditions: "Termos pt",
    thank_you_message: "Obrigado pt",
    email_subject: "Proposta: {{titulo_proposta}}",
    sections: [
      { id: "header", type: "header", label: "Cabeçalho", visible: true, settings: { customTitle: "PROPOSTA", layout: "quote_pdf" } },
      { id: "terms", type: "terms", label: "Condições Gerais", visible: true, settings: { sectionLabel: "CONDIÇÕES GERAIS", collapsible: false } },
      { id: "custom_1699", type: "custom", label: "Garantia", visible: true, settings: { content: "<p>Garantia de 5 anos</p>" } },
      { id: "notes", type: "notes", label: "Notas", visible: true, settings: { sectionLabel: "NOTAS" } },
    ],
    design_settings: {
      accept_button_text: "Aceitar Proposta",
      reject_button_text: "Recusar",
      items_table: { mode: "grouped_by_quote" },
      versions: {
        en: {
          header_text: "Header en",
          terms_conditions: "Terms en",
          accept_button_text: "Accept",
          email_subject: "Proposal: {{titulo_proposta}}",
          sections: {
            header: { customTitle: "PROPOSAL" },
            terms: { label: "General terms", sectionLabel: "GENERAL TERMS" },
            custom_1699: { label: "Warranty", content: "<p>5-year warranty</p>" },
          },
        },
      },
    },
  };
}

describe("idiomasDisponiveisProposta", () => {
  it("sem versões: só o base", () => {
    expect(idiomasDisponiveisProposta({ design_settings: {} })).toEqual(["pt"]);
    expect(idiomasDisponiveisProposta({ design_settings: null })).toEqual(["pt"]);
    expect(idiomasDisponiveisProposta(null)).toEqual(["pt"]);
  });

  it("a chave existir basta, mesmo que a versão esteja quase vazia", () => {
    expect(idiomasDisponiveisProposta(propostaTemplate())).toEqual(["pt", "en"]);
    expect(idiomasDisponiveisProposta({ design_settings: { versions: { en: {} } } })).toEqual(["pt", "en"]);
  });

  it("ignora valores que não são objetos e códigos desconhecidos", () => {
    expect(idiomasDisponiveisProposta({ design_settings: { versions: { en: null, xx: {}, es: "x" } } })).toEqual(["pt"]);
  });
});

describe("aplicarVersaoProposta", () => {
  it("base ou sem versões ou versão inexistente: a MESMA referência", () => {
    const t = propostaTemplate();
    expect(aplicarVersaoProposta(t, "pt")).toBe(t);
    expect(aplicarVersaoProposta(t, "es")).toBe(t);
    expect(aplicarVersaoProposta(t, "xx")).toBe(t);
    const s = { design_settings: { cor: "x" } };
    expect(aplicarVersaoProposta(s, "en")).toBe(s);
    const n = { design_settings: null };
    expect(aplicarVersaoProposta(n, "en")).toBe(n);
  });

  it("aplica os textos da versão e deixa no base os que ela não traz", () => {
    const r = aplicarVersaoProposta(propostaTemplate(), "en") as any;
    expect(r.header_text).toBe("Header en");
    expect(r.terms_conditions).toBe("Terms en");
    expect(r.email_subject).toBe("Proposal: {{titulo_proposta}}");
    expect(r.footer_text).toBe("Rodapé pt");
    expect(r.thank_you_message).toBe("Obrigado pt");
  });

  it("os botões aceitar/rejeitar vivem em design_settings", () => {
    const r = aplicarVersaoProposta(propostaTemplate(), "en") as any;
    expect(r.design_settings.accept_button_text).toBe("Accept");
    expect(r.design_settings.reject_button_text).toBe("Recusar");
    expect(r.design_settings.items_table).toEqual({ mode: "grouped_by_quote" });
  });

  it("sobrepõe as secções por id: label, customTitle, sectionLabel e content", () => {
    const r = aplicarVersaoProposta(propostaTemplate(), "en") as any;
    const porId = Object.fromEntries(r.sections.map((s: any) => [s.id, s]));
    expect(porId.header.settings.customTitle).toBe("PROPOSAL");
    expect(porId.header.settings.layout).toBe("quote_pdf");
    expect(porId.header.label).toBe("Cabeçalho");
    expect(porId.terms.label).toBe("General terms");
    expect(porId.terms.settings.sectionLabel).toBe("GENERAL TERMS");
    expect(porId.terms.settings.collapsible).toBe(false);
    expect(porId.custom_1699.label).toBe("Warranty");
    expect(porId.custom_1699.settings.content).toBe("<p>5-year warranty</p>");
  });

  it("layout e visibilidade são únicos; secções sem versão ficam como estão; a ordem mantém-se", () => {
    const t = propostaTemplate();
    const r = aplicarVersaoProposta(t, "en") as any;
    expect(r.sections.map((s: any) => s.id)).toEqual(["header", "terms", "custom_1699", "notes"]);
    expect(r.sections.map((s: any) => s.visible)).toEqual([true, true, true, true]);
    expect(r.sections[3]).toBe(t.sections[3]);
  });

  it("não muda o original", () => {
    const t = propostaTemplate();
    const antes = JSON.stringify(t);
    aplicarVersaoProposta(t, "en");
    expect(JSON.stringify(t)).toBe(antes);
  });

  it("texto vazio na versão cai no base", () => {
    const t = propostaTemplate();
    (t.design_settings.versions.en as any).header_text = "  ";
    expect((aplicarVersaoProposta(t, "en") as any).header_text).toBe("Cabeçalho pt");
  });

  it("sem secções no template não rebenta", () => {
    const t = { design_settings: { versions: { en: { footer_text: "F", sections: { terms: { label: "x" } } } } } };
    const r = aplicarVersaoProposta(t, "en") as any;
    expect(r.footer_text).toBe("F");
    expect(r.sections).toBeUndefined();
  });
});
