import { describe, expect, it } from "vitest";
import { calcularBaseHashDoTemplate, calcularCompletude, idiomasDisponiveisProposta } from "@/lib/idiomaDocumento";
import {
  adicionarVersao,
  comVersoesNoDesign,
  configNoIdioma,
  definirCampoDeSeccao,
  definirTexto,
  idiomasQueFaltaAdicionar,
  listarCampos,
  marcarComoAtualizada,
  modeloParaVersoes,
  removerVersao,
  resumoDeIdiomas,
  resumoDeIdiomasDoTemplate,
  separarVersoes,
  type ConfigComTextos,
} from "../modeloVersoes";

function config(extra: Partial<ConfigComTextos> = {}): ConfigComTextos {
  return {
    header_text: "",
    footer_text: "Rodapé em português",
    terms_conditions: "Termos em português",
    thank_you_message: "",
    email_subject: "Proposta: {{titulo_proposta}}",
    email_body: "<p>Olá</p>",
    verification_email_subject: "",
    verification_email_body: "",
    accept_button_text: "Aceitar Proposta",
    reject_button_text: "Recusar",
    sections: [
      { id: "header", type: "header", label: "Cabeçalho", visible: true, settings: { customTitle: "PROPOSTA" } },
      { id: "terms", type: "terms", label: "Condições Gerais", visible: true, settings: { sectionLabel: "CONDIÇÕES GERAIS" } },
      { id: "custom_1", type: "custom", label: "Garantia", visible: true, settings: { content: "Dois anos" } },
      { id: "validity", type: "validity", label: "Validade", visible: false, settings: { sectionLabel: "Válida até" } },
    ],
    ...extra,
  };
}

describe("separarVersoes", () => {
  it("sem versions: o design fica igual e as versões vazias", () => {
    const design = { items_table: { a: 1 }, max_width: 794 };
    const { restante, versoes } = separarVersoes(design);
    expect(restante).toEqual(design);
    expect(versoes).toEqual({});
  });

  it("tira `versions` do restante e devolve uma cópia profunda", () => {
    const design = { max_width: 794, versions: { en: { footer_text: "x" } } };
    const { restante, versoes } = separarVersoes(design);
    expect("versions" in restante).toBe(false);
    expect(versoes).toEqual({ en: { footer_text: "x" } });
    expect(versoes).not.toBe(design.versions);
    expect(versoes.en).not.toBe(design.versions.en);
  });

  it("lixo em `versions` ou design inválido não rebenta", () => {
    expect(separarVersoes({ versions: "x" }).versoes).toEqual({});
    expect(separarVersoes({ versions: [1] }).versoes).toEqual({});
    expect(separarVersoes(null)).toEqual({ restante: {}, versoes: {} });
    expect(separarVersoes(undefined)).toEqual({ restante: {}, versoes: {} });
    expect(separarVersoes([1, 2])).toEqual({ restante: {}, versoes: {} });
  });
});

describe("modeloParaVersoes", () => {
  it("monta o template que o núcleo entende (textos de design dentro de design_settings)", () => {
    const m = modeloParaVersoes(config(), { en: { footer_text: "Footer" } });
    expect(m.footer_text).toBe("Rodapé em português");
    expect(m.header_text).toBeNull();
    expect(m.design_settings).toMatchObject({ accept_button_text: "Aceitar Proposta", versions: { en: { footer_text: "Footer" } } });
    expect(idiomasDisponiveisProposta(m)).toEqual(["pt", "en"]);
  });

  it("o hash do português é o mesmo antes e depois de gravar (vazio vira null na base)", () => {
    const c = config();
    const hashEditor = calcularBaseHashDoTemplate(modeloParaVersoes(c, {}));
    const linhaGravada = {
      header_text: c.header_text || null,
      footer_text: c.footer_text || null,
      terms_conditions: c.terms_conditions || null,
      thank_you_message: c.thank_you_message || null,
      email_subject: c.email_subject || null,
      email_body: c.email_body || null,
      verification_email_subject: c.verification_email_subject || null,
      verification_email_body: c.verification_email_body || null,
      sections: JSON.parse(JSON.stringify(c.sections)),
      design_settings: { accept_button_text: c.accept_button_text, reject_button_text: c.reject_button_text },
    };
    expect(calcularBaseHashDoTemplate(linhaGravada)).toBe(hashEditor);
  });
});

describe("configNoIdioma (pré-visualização)", () => {
  const versoes = {
    en: {
      footer_text: "English footer",
      accept_button_text: "Accept",
      sections: { header: { customTitle: "PROPOSAL" }, custom_1: { label: "Warranty", content: "Two years" } },
    },
  };

  it("idioma base ou sem versões: a MESMA referência", () => {
    const c = config();
    expect(configNoIdioma(c, versoes, "pt")).toBe(c);
    expect(configNoIdioma(c, {}, "en")).toBe(c);
    expect(configNoIdioma(c, versoes, "fr")).toBe(c);
  });

  it("aplica textos, botões e títulos de secção, sem mexer no resto", () => {
    const c = config();
    const r = configNoIdioma(c, versoes, "en");
    expect(r).not.toBe(c);
    expect(r.footer_text).toBe("English footer");
    expect(r.accept_button_text).toBe("Accept");
    expect(r.reject_button_text).toBe("Recusar");
    expect(r.terms_conditions).toBe("Termos em português");
    expect(r.sections.find((s) => (s as { id: string }).id === "header")).toMatchObject({ settings: { customTitle: "PROPOSAL" } });
    expect(r.sections.find((s) => (s as { id: string }).id === "custom_1")).toMatchObject({ label: "Warranty", settings: { content: "Two years" } });
    // o original não foi tocado
    expect(c.footer_text).toBe("Rodapé em português");
  });

  it("preserva o tipo do config (campos de cor e afins passam intactos)", () => {
    const c = { ...config(), primary_color: "#123456" };
    expect(configNoIdioma(c, versoes, "en").primary_color).toBe("#123456");
  });
});

describe("adicionarVersao", () => {
  it("sem cópia: cria só a marca e o base_hash", () => {
    const c = config();
    const v = adicionarVersao({}, "en", c, { copiarPortugues: false });
    expect(Object.keys(v)).toEqual(["en"]);
    expect(v.en).toEqual({ base_hash: calcularBaseHashDoTemplate(modeloParaVersoes(c, {})) });
  });

  it("com cópia: copia os textos e os títulos de secção do português", () => {
    const v = adicionarVersao({}, "en", config(), { copiarPortugues: true });
    const en = v.en as Record<string, unknown>;
    expect(en.footer_text).toBe("Rodapé em português");
    expect(en.accept_button_text).toBe("Aceitar Proposta");
    expect("header_text" in en).toBe(false); // vazio no português: não se copia
    expect(en.sections).toEqual({
      header: { customTitle: "PROPOSTA" },
      terms: { sectionLabel: "CONDIÇÕES GERAIS" },
      custom_1: { label: "Garantia", content: "Dois anos" },
      validity: { sectionLabel: "Válida até" },
    });
  });

  it("com cópia, a lista de verificação marca tudo como «igual ao português»", () => {
    const c = config();
    const v = adicionarVersao({}, "en", c, { copiarPortugues: true });
    const campos = listarCampos(c, v, "en");
    expect(campos.length).toBeGreaterThan(0);
    expect(campos.filter((x) => x.estado === "traduzido")).toEqual([]);
    expect(campos.every((x) => x.estado === "igual")).toBe(true);
  });

  it("sem cópia, tudo está «em falta»", () => {
    const c = config();
    const v = adicionarVersao({}, "en", c, { copiarPortugues: false });
    expect(listarCampos(c, v, "en").every((x) => x.estado === "falta")).toBe(true);
  });

  it("não duplica nem aceita base, desconhecido ou código vazio (mesma referência)", () => {
    const c = config();
    const v = adicionarVersao({}, "en", c, { copiarPortugues: false });
    expect(adicionarVersao(v, "en", c, { copiarPortugues: true })).toBe(v);
    expect(adicionarVersao(v, "pt", c, { copiarPortugues: true })).toBe(v);
    expect(adicionarVersao(v, "xx", c, { copiarPortugues: true })).toBe(v);
    expect(adicionarVersao(v, "", c, { copiarPortugues: true })).toBe(v);
  });

  it("preserva versões de códigos que o registo não conhece", () => {
    const v = adicionarVersao({ zz: { footer_text: "?" } }, "en", config(), { copiarPortugues: false });
    expect(v.zz).toEqual({ footer_text: "?" });
    expect(Object.keys(v)).toEqual(["zz", "en"]);
  });

  it("não muta o objeto de entrada", () => {
    const entrada = Object.freeze({});
    expect(() => adicionarVersao(entrada, "en", config(), { copiarPortugues: true })).not.toThrow();
  });
});

describe("definirTexto e definirCampoDeSeccao", () => {
  const base = adicionarVersao({}, "en", config(), { copiarPortugues: false });

  it("escreve um texto e é imutável", () => {
    const v = definirTexto(base, "en", "footer_text", "Footer");
    expect((v.en as Record<string, unknown>).footer_text).toBe("Footer");
    expect(base.en).not.toHaveProperty("footer_text");
  });

  it("texto vazio (ou só espaços) apaga a chave em vez de gravar ''", () => {
    const v1 = definirTexto(base, "en", "footer_text", "Footer");
    const v2 = definirTexto(v1, "en", "footer_text", "   ");
    expect(v2.en).not.toHaveProperty("footer_text");
  });

  it("versão inexistente: mesma referência", () => {
    expect(definirTexto(base, "fr", "footer_text", "x")).toBe(base);
    expect(definirCampoDeSeccao(base, "fr", "terms", "sectionLabel", "x")).toBe(base);
  });

  it("escreve a sobreposição por id e limpa o que ficar vazio", () => {
    const v1 = definirCampoDeSeccao(base, "en", "terms", "sectionLabel", "GENERAL TERMS");
    expect((v1.en as Record<string, unknown>).sections).toEqual({ terms: { sectionLabel: "GENERAL TERMS" } });
    const v2 = definirCampoDeSeccao(v1, "en", "terms", "label", "General terms");
    expect((v2.en as { sections: Record<string, unknown> }).sections.terms).toEqual({ sectionLabel: "GENERAL TERMS", label: "General terms" });
    const v3 = definirCampoDeSeccao(definirCampoDeSeccao(v2, "en", "terms", "sectionLabel", ""), "en", "terms", "label", "");
    expect(v3.en).not.toHaveProperty("sections");
  });

  it("a sobreposição aparece no completude do núcleo", () => {
    const c = config();
    const v = definirCampoDeSeccao(base, "en", "terms", "sectionLabel", "GENERAL TERMS");
    const comp = calcularCompletude(modeloParaVersoes(c, v), "en");
    expect(comp.faltam).not.toContain("sections.terms.sectionLabel");
    expect(comp.faltam).toContain("sections.header.customTitle");
  });
});

describe("removerVersao e marcarComoAtualizada", () => {
  it("remove só a versão pedida", () => {
    const v = adicionarVersao(adicionarVersao({}, "en", config(), { copiarPortugues: false }), "es", config(), { copiarPortugues: false });
    expect(Object.keys(removerVersao(v, "en"))).toEqual(["es"]);
    expect(removerVersao(v, "fr")).toBe(v);
  });

  it("marcarComoAtualizada refresca o base_hash para o português de agora", () => {
    const c1 = config();
    const v = adicionarVersao({}, "en", c1, { copiarPortugues: false });
    const c2 = config({ footer_text: "Rodapé novo" });
    expect(calcularCompletude(modeloParaVersoes(c2, v), "en").desatualizado).toBe(true);
    const v2 = marcarComoAtualizada(v, "en", c2);
    expect(calcularCompletude(modeloParaVersoes(c2, v2), "en").desatualizado).toBe(false);
  });
});

describe("resumoDeIdiomas", () => {
  it("sem versões: lista vazia (a barra não aparece)", () => {
    expect(resumoDeIdiomas(config(), {})).toEqual([]);
  });

  it("uma entrada por idioma não base, com o que falta e o aviso de desatualizado", () => {
    const c = config();
    const v = adicionarVersao({}, "en", c, { copiarPortugues: true });
    const r = resumoDeIdiomas(c, v);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ codigo: "en", desatualizado: false });
    expect(r[0].faltam).toBeGreaterThan(0);
    const r2 = resumoDeIdiomas(config({ footer_text: "outro" }), v);
    expect(r2[0].desatualizado).toBe(true);
  });
});

describe("idiomasQueFaltaAdicionar", () => {
  it("devolve os do registo que ainda não existem e nunca o base", () => {
    const livres = idiomasQueFaltaAdicionar({ en: { base_hash: "x" } });
    expect(livres).not.toContain("pt");
    expect(livres).not.toContain("en");
    expect(livres).toContain("es");
    expect(idiomasQueFaltaAdicionar({})).toContain("en");
  });
});

describe("comVersoesNoDesign (gravação)", () => {
  const original = { max_width: 794, items_table: { a: 1 } };

  it("sem versões e sem versões originais: devolve o MESMO design, sem chave `versions`", () => {
    const design = { ...original };
    const r = comVersoesNoDesign(design, {}, original);
    expect(r).toBe(design);
    expect("versions" in r).toBe(false);
    expect(JSON.stringify(r)).toBe(JSON.stringify(original));
  });

  it("com versões: acrescenta `versions`", () => {
    const r = comVersoesNoDesign({ ...original }, { en: { base_hash: "x" } }, original);
    expect(r.versions).toEqual({ en: { base_hash: "x" } });
  });

  it("versões intactas: o JSON é idêntico ao original, byte a byte (ordem das chaves incluída)", () => {
    const orig = { a: 1, versions: { en: { footer_text: "x", sections: { terms: { label: "T" } } } }, z: 2 };
    const { restante, versoes } = separarVersoes(orig);
    const design = { ...orig, a: restante.a };
    const r = comVersoesNoDesign(design, versoes, orig);
    expect(JSON.stringify(r)).toBe(JSON.stringify(orig));
  });

  it("versões todas removidas: a chave sai", () => {
    const orig = { max_width: 1, versions: { en: { footer_text: "x" } } };
    const r = comVersoesNoDesign({ ...orig }, {}, orig);
    expect("versions" in r).toBe(false);
  });

  it("`versions: {}` ou lixo no original e nada editado: não se mexe", () => {
    const orig = { versions: {} };
    const design = { ...orig };
    expect(comVersoesNoDesign(design, {}, orig)).toBe(design);
    const orig2 = { versions: "lixo" };
    const design2 = { ...orig2 };
    expect(comVersoesNoDesign(design2, {}, orig2)).toBe(design2);
  });

  it("original nulo (template novo) funciona", () => {
    const design = { max_width: 1 };
    expect(comVersoesNoDesign(design, {}, null)).toBe(design);
    expect(comVersoesNoDesign(design, { en: { base_hash: "x" } }, null).versions).toEqual({ en: { base_hash: "x" } });
  });
});

describe("listarCampos", () => {
  it("distingue traduzido, igual ao português e em falta", () => {
    const c = config();
    let v = adicionarVersao({}, "en", c, { copiarPortugues: true });
    v = definirTexto(v, "en", "footer_text", "English footer");
    v = definirTexto(v, "en", "terms_conditions", "");
    const campos = listarCampos(c, v, "en");
    const por = (chave: string) => campos.find((x) => x.chave === chave);
    expect(por("footer_text")).toMatchObject({ estado: "traduzido", base: "Rodapé em português", traduzido: "English footer" });
    expect(por("terms_conditions")).toMatchObject({ estado: "falta", traduzido: "" });
    expect(por("accept_button_text")).toMatchObject({ estado: "igual" });
    expect(por("sections.header.customTitle")).toMatchObject({ estado: "igual", tipo: "seccao", seccaoId: "header", campo: "customTitle" });
  });

  it("só lista campos que têm texto no português e só secções visíveis", () => {
    const c = config();
    const campos = listarCampos(c, adicionarVersao({}, "en", c, { copiarPortugues: false }), "en");
    const chaves = campos.map((x) => x.chave);
    expect(chaves).not.toContain("header_text"); // vazio no português
    expect(chaves).not.toContain("sections.validity.sectionLabel"); // secção escondida
    expect(chaves).toContain("sections.custom_1.content");
  });

  it("o total de «em falta + igual» bate com o `faltam` do núcleo", () => {
    const c = config();
    const v = adicionarVersao({}, "en", c, { copiarPortugues: true });
    const campos = listarCampos(c, v, "en");
    const nucleo = calcularCompletude(modeloParaVersoes(c, v), "en").faltam;
    expect(campos.filter((x) => x.estado !== "traduzido").map((x) => x.chave).sort()).toEqual([...nucleo].sort());
  });

  it("idioma base: lista vazia", () => {
    expect(listarCampos(config(), {}, "pt")).toEqual([]);
  });
});

describe("resumoDeIdiomasDoTemplate (cartões da lista)", () => {
  function linha(extra: Record<string, unknown> = {}) {
    return {
      header_text: null,
      footer_text: "Rodapé",
      terms_conditions: null,
      thank_you_message: null,
      email_subject: null,
      email_body: null,
      verification_email_subject: null,
      verification_email_body: null,
      sections: [],
      design_settings: { accept_button_text: "Aceitar", ...extra },
      ...{},
    };
  }

  it("sem versões: só o português e nada incompleto", () => {
    expect(resumoDeIdiomasDoTemplate(linha())).toEqual({ idiomas: ["pt"], incompletos: [] });
    expect(resumoDeIdiomasDoTemplate({ design_settings: null, sections: null })).toEqual({ idiomas: ["pt"], incompletos: [] });
    expect(resumoDeIdiomasDoTemplate(null)).toEqual({ idiomas: ["pt"], incompletos: [] });
  });

  it("com versões: lista os idiomas e assinala os incompletos", () => {
    const r = resumoDeIdiomasDoTemplate(linha({ versions: { en: { base_hash: "x" } } }));
    expect(r.idiomas).toEqual(["pt", "en"]);
    expect(r.incompletos).toEqual([{ codigo: "en", faltam: 2 }]);
  });

  it("versão completa não aparece como incompleta", () => {
    const r = resumoDeIdiomasDoTemplate(linha({ versions: { en: { footer_text: "Footer", accept_button_text: "Accept" } } }));
    expect(r.idiomas).toEqual(["pt", "en"]);
    expect(r.incompletos).toEqual([]);
  });
});
