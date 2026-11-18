import { describe, expect, it } from "vitest";
import { calcularBaseHash, calcularCompletude } from "@/lib/idiomaDocumento";
import { buildQuoteItemsChipHtml, readQuoteItemsChipConfig } from "@/components/contracts/TableInsertPopover";
import { DEFAULT_QUOTE_ITEMS_CONFIG } from "@/components/contracts/DataTableConfigForm";
import {
  adicionarVersao,
  camposDoIdioma,
  codigosDasVersoes,
  escreverCorpo,
  escreverSettings,
  idiomasPorAdicionar,
  linhasDeVerificacao,
  marcarRevisto,
  removerVersao,
  type EstadoMinuta,
} from "../versoesDoTemplate";

const CORPO_PT = "<h2>CONTRATO DE SERVIÇOS</h2><p>Entre {{empresa_nome}} e {{cliente_nome}}.</p>";

function minuta(extra: Partial<EstadoMinuta> = {}): EstadoMinuta {
  return {
    language: "pt",
    body_html: CORPO_PT,
    doc_settings: {
      primary_color: "#112233",
      margin_top: 25,
      header_style: "split",
      contract_block_title: "CONTRATO",
      contract_block_subtitle: "www.exemplo.pt",
      contract_block_number_label: "CONTRATO Nº",
      footer_text: "Documento gerado pelo Olyvia",
      quote_items_title: "Artigos do Orçamento",
      chave_desconhecida: { a: 1 },
    },
    ...extra,
  };
}

const semVersoes = () => minuta();
const comEn = () => adicionarVersao(minuta(), "en", true);

describe("sem versões: tudo como hoje", () => {
  it("o idioma base devolve o corpo e o doc_settings tal e qual (mesma referência)", () => {
    const m = semVersoes();
    const c = camposDoIdioma(m, "pt");
    expect(c.body_html).toBe(m.body_html);
    expect(c.settings).toBe(m.doc_settings);
  });

  it("editar no idioma base escreve o corpo e o doc_settings sem acrescentar a chave versions", () => {
    const m = semVersoes();
    const r = escreverSettings(m, "pt", { ...m.doc_settings!, primary_color: "#000000" });
    expect(r.doc_settings).toEqual({ ...m.doc_settings, primary_color: "#000000" });
    expect(r.doc_settings).not.toHaveProperty("versions");
    expect(escreverCorpo(m, "pt", "<p>novo</p>")).toEqual({ body_html: "<p>novo</p>", doc_settings: m.doc_settings });
    expect(codigosDasVersoes(m)).toEqual([]);
  });

  it("template sem doc_settings: escrever o corpo base mantém doc_settings a null", () => {
    const m = minuta({ doc_settings: null });
    expect(escreverCorpo(m, "pt", "<p>x</p>").doc_settings).toBeNull();
    expect(camposDoIdioma(m, "pt").settings).toBeNull();
  });
});

describe("adicionarVersao", () => {
  it("com cópia: leva o corpo, os textos que o base tem e o base_hash; preserva o resto sem mutar o original", () => {
    const original = semVersoes();
    const antes = JSON.stringify(original);
    const r = adicionarVersao(original, "en", true);

    expect(JSON.stringify(original)).toBe(antes);
    const ds = r.doc_settings as Record<string, any>;
    expect(ds.chave_desconhecida).toEqual({ a: 1 });
    expect(ds.primary_color).toBe("#112233");
    expect(ds.versions.en).toEqual({
      body_html: CORPO_PT,
      header: {
        contract_block_title: "CONTRATO",
        contract_block_subtitle: "www.exemplo.pt",
        contract_block_number_label: "CONTRATO Nº",
      },
      footer_text: "Documento gerado pelo Olyvia",
      quote_items_title: "Artigos do Orçamento",
      base_hash: calcularBaseHash(CORPO_PT),
    });
    expect(r.body_html).toBe(CORPO_PT);
  });

  it("com cópia, a versão aparece como «por traduzir» até o texto diferir", () => {
    const m = comEn();
    const c = calcularCompletude(m, "en");
    expect(c.completo).toBe(false);
    expect(c.faltam).toContain("body_html");
    const traduzida = escreverCorpo(m, "en", "<h2>SERVICES AGREEMENT</h2>");
    expect(calcularCompletude({ ...m, ...traduzida }, "en").faltam).not.toContain("body_html");
  });

  it("sem cópia: corpo vazio, sem textos e com base_hash", () => {
    const ds = adicionarVersao(semVersoes(), "en", false).doc_settings as Record<string, any>;
    expect(ds.versions.en).toEqual({ body_html: "", base_hash: calcularBaseHash(CORPO_PT) });
  });

  it("não acrescenta o idioma base, nem um que já existe, nem um desconhecido (mesma referência)", () => {
    const m = comEn();
    expect(adicionarVersao(m, "pt", true)).toBe(m);
    expect(adicionarVersao(m, "en", true)).toBe(m);
    expect(adicionarVersao(m, "xx", true)).toBe(m);
  });

  it("um template sem doc_settings passa a ter só a chave versions", () => {
    const r = adicionarVersao(minuta({ doc_settings: null }), "en", true);
    expect(Object.keys(r.doc_settings!)).toEqual(["versions"]);
  });

  it("preserva versões de códigos que a interface não conhece", () => {
    const m = minuta();
    (m.doc_settings as Record<string, unknown>).versions = { zz: { body_html: "<p>zz</p>" } };
    const ds = adicionarVersao(m, "en", true).doc_settings as Record<string, any>;
    expect(ds.versions.zz).toEqual({ body_html: "<p>zz</p>" });
    expect(ds.versions.en).toBeDefined();
  });
});

describe("camposDoIdioma numa versão", () => {
  it("devolve o corpo da versão e os textos traduzíveis; o resto vem do base", () => {
    const c = camposDoIdioma(comEn(), "en");
    expect(c.body_html).toBe(CORPO_PT);
    expect(c.settings).toMatchObject({
      primary_color: "#112233",
      contract_block_title: "CONTRATO",
      footer_text: "Documento gerado pelo Olyvia",
      quote_items_title: "Artigos do Orçamento",
    });
  });

  it("o que a versão não tem aparece vazio (e não o texto base), exceto o subtítulo que cai no base como no render", () => {
    const m = adicionarVersao(semVersoes(), "en", false);
    const s = camposDoIdioma(m, "en").settings as Record<string, unknown>;
    expect(s.contract_block_title).toBe("");
    expect(s.contract_block_number_label).toBe("");
    expect(s.footer_text).toBe("");
    expect(s.quote_items_title).toBe("");
    expect(s.contract_block_subtitle).toBe("www.exemplo.pt");
    expect(camposDoIdioma(m, "en").body_html).toBe("");
  });
});

describe("escreverCorpo numa versão", () => {
  it("escreve só na versão, deixa o corpo base e atualiza o base_hash", () => {
    const m = comEn();
    const r = escreverCorpo(m, "en", "<h2>SERVICES AGREEMENT</h2>");
    expect(r.body_html).toBe(CORPO_PT);
    const en = (r.doc_settings as any).versions.en;
    expect(en.body_html).toBe("<h2>SERVICES AGREEMENT</h2>");
    expect(en.base_hash).toBe(calcularBaseHash(CORPO_PT));
    expect(en.footer_text).toBe("Documento gerado pelo Olyvia");
  });

  it("preserva chaves desconhecidas dentro da versão", () => {
    const m = comEn();
    (m.doc_settings as any).versions.en.extra = 7;
    expect((escreverCorpo(m, "en", "<p>x</p>").doc_settings as any).versions.en.extra).toBe(7);
  });
});

describe("escreverSettings numa versão", () => {
  const settingsDe = (m: EstadoMinuta, codigo: string) => camposDoIdioma(m, codigo).settings as Record<string, unknown>;

  it("grava o título do cabeçalho, o rodapé e o título da tabela na versão, sem tocar no base", () => {
    const m = comEn();
    const next = { ...settingsDe(m, "en"), contract_block_title: "CONTRACT", footer_text: "Generated by Olyvia", quote_items_title: "Quote items" };
    const r = escreverSettings(m, "en", next);
    const ds = r.doc_settings as Record<string, any>;
    expect(ds.versions.en.header.contract_block_title).toBe("CONTRACT");
    expect(ds.versions.en.footer_text).toBe("Generated by Olyvia");
    expect(ds.versions.en.quote_items_title).toBe("Quote items");
    expect(ds.contract_block_title).toBe("CONTRATO");
    expect(ds.footer_text).toBe("Documento gerado pelo Olyvia");
    expect(ds.quote_items_title).toBe("Artigos do Orçamento");
  });

  it("ignora tudo o que é comum (cores, margens, estilo): só o idioma base os altera", () => {
    const m = comEn();
    const r = escreverSettings(m, "en", { ...settingsDe(m, "en"), primary_color: "#ff0000", margin_top: 99, header_style: "simple" });
    expect(r.doc_settings).toEqual(m.doc_settings);
  });

  it("apagar um texto traduzido tira a chave da versão (volta ao fallback)", () => {
    const m = comEn();
    const r = escreverSettings(m, "en", { ...settingsDe(m, "en"), footer_text: "", contract_block_number_label: "" });
    const en = (r.doc_settings as any).versions.en;
    expect(en).not.toHaveProperty("footer_text");
    expect(en.header).not.toHaveProperty("contract_block_number_label");
    expect(en.header.contract_block_title).toBe("CONTRATO");
  });

  it("apagar o subtítulo guarda null (esconde o do base); não mexer nele não escreve nada", () => {
    const m = comEn();
    const r = escreverSettings(m, "en", { ...settingsDe(m, "en"), contract_block_subtitle: null });
    expect((r.doc_settings as any).versions.en.header.contract_block_subtitle).toBeNull();

    const semTocar = adicionarVersao(semVersoes(), "en", false);
    const r2 = escreverSettings(semTocar, "en", { ...settingsDe(semTocar, "en"), footer_text: "Footer" });
    expect((r2.doc_settings as any).versions.en).not.toHaveProperty("header");
  });

  it("mudar o título da tabela atualiza também o título do bloco da tabela no corpo da versão", () => {
    const chip = buildQuoteItemsChipHtml({ ...DEFAULT_QUOTE_ITEMS_CONFIG, title: "Artigos do Orçamento", showPrice: false });
    const m = adicionarVersao(minuta({ body_html: `<p>a</p>${chip}<p>b</p>` }), "en", true);
    const r = escreverSettings(m, "en", { ...settingsDe(m, "en"), quote_items_title: "Quote items" });
    const corpoEn = (r.doc_settings as any).versions.en.body_html as string;
    const cfg = readQuoteItemsChipConfig(corpoEn);
    expect(cfg?.title).toBe("Quote items");
    expect(cfg?.showPrice).toBe(false);
    expect(r.body_html).toBe(m.body_html);
  });

  it("sem bloco de tabela no corpo da versão, o corpo fica igual", () => {
    const m = comEn();
    const r = escreverSettings(m, "en", { ...settingsDe(m, "en"), quote_items_title: "Quote items" });
    expect((r.doc_settings as any).versions.en.body_html).toBe(CORPO_PT);
  });
});

describe("removerVersao", () => {
  it("remove só essa versão; com a última, a chave versions desaparece e o resto fica", () => {
    const m = adicionarVersao(comEn(), "es", false);
    const r1 = removerVersao(m, "en");
    expect(codigosDasVersoes(r1)).toEqual(["es"]);
    const r2 = removerVersao(r1, "es");
    expect(r2.doc_settings).not.toHaveProperty("versions");
    expect(r2.doc_settings).toEqual(semVersoes().doc_settings);
  });

  it("adicionar e remover num template sem doc_settings volta a null", () => {
    const r = removerVersao(adicionarVersao(minuta({ doc_settings: null }), "en", true), "en");
    expect(r.doc_settings).toBeNull();
  });

  it("remover um idioma que não existe não muda nada (mesma referência)", () => {
    const m = comEn();
    expect(removerVersao(m, "fr")).toBe(m);
    expect(removerVersao(m, "pt")).toBe(m);
  });
});

describe("marcarRevisto e desatualizado", () => {
  it("depois de mudar o texto base, a versão fica desatualizada até ser marcada como revista", () => {
    const m = comEn();
    const mudado: EstadoMinuta = { ...m, body_html: `${CORPO_PT}<p>nova cláusula</p>` };
    expect(calcularCompletude(mudado, "en").desatualizado).toBe(true);
    const revisto = { ...mudado, ...marcarRevisto(mudado, "en") };
    expect(calcularCompletude(revisto, "en").desatualizado).toBe(false);
  });
});

describe("idiomasPorAdicionar e codigosDasVersoes", () => {
  it("lista os idiomas do registo que ainda não existem, sem o base, pela ordem do registo", () => {
    expect(idiomasPorAdicionar(semVersoes())).toEqual(["en", "es", "fr"]);
    expect(idiomasPorAdicionar(comEn())).toEqual(["es", "fr"]);
  });

  it("com o texto base noutro idioma, o português passa a ser um idioma a adicionar", () => {
    const m = minuta({ language: "en" });
    expect(idiomasPorAdicionar(m)).toEqual(["pt", "es", "fr"]);
  });

  it("codigosDasVersoes ordena pelo registo", () => {
    const m = adicionarVersao(adicionarVersao(semVersoes(), "fr", false), "en", false);
    expect(codigosDasVersoes(m)).toEqual(["en", "fr"]);
  });
});

describe("linhasDeVerificacao", () => {
  it("corpo, cabeçalho, rodapé e tabela: igual ao português logo depois da cópia", () => {
    const linhas = linhasDeVerificacao(comEn(), "en");
    expect(linhas.map((l) => [l.chave, l.estado])).toEqual([
      ["corpo", "igual"],
      ["titulo_cabecalho", "igual"],
      ["rodape", "igual"],
      ["tabela", "igual"],
      ["rotulos", "igual"],
    ]);
    expect(linhas[0].textoBase).toContain("CONTRATO DE SERVIÇOS");
    expect(linhas[2].textoBase).toBe("Documento gerado pelo Olyvia");
  });

  it("traduzido, igual e em falta distinguem-se", () => {
    let m = adicionarVersao(semVersoes(), "en", false);
    m = { ...m, ...escreverSettings(m, "en", { ...camposDoIdioma(m, "en").settings, footer_text: "Generated by Olyvia", quote_items_title: "Artigos do Orçamento" }) };
    const por = Object.fromEntries(linhasDeVerificacao(m, "en").map((l) => [l.chave, l.estado]));
    expect(por.corpo).toBe("falta");
    expect(por.titulo_cabecalho).toBe("falta");
    expect(por.rodape).toBe("traduzido");
    expect(por.tabela).toBe("igual");
  });

  it("não mostra as linhas em que o português também não tem texto (só o corpo é sempre mostrado)", () => {
    const m = adicionarVersao(minuta({ doc_settings: { header_style: "split" } }), "en", true);
    expect(linhasDeVerificacao(m, "en").map((l) => l.chave)).toEqual(["corpo"]);
  });

  it("a linha dos outros rótulos conta quantos faltam", () => {
    const base = minuta();
    (base.doc_settings as any).contract_block_date_label = "Data:";
    const m = adicionarVersao(base, "en", true);
    const rotulos = linhasDeVerificacao(m, "en").find((l) => l.chave === "rotulos");
    expect(rotulos?.pendentes).toBe(2);
    expect(rotulos?.textoBase).toBe("CONTRATO Nº · Data:");
  });

  it("para o idioma base devolve lista vazia", () => {
    expect(linhasDeVerificacao(comEn(), "pt")).toEqual([]);
  });

  it("o número de linhas pendentes mais os rótulos extra bate com calcularCompletude().faltam", () => {
    const m = comEn();
    const linhas = linhasDeVerificacao(m, "en");
    const pendentes = linhas.filter((l) => l.estado !== "traduzido").reduce((n, l) => n + l.pendentes, 0);
    expect(pendentes).toBe(calcularCompletude(m, "en").faltam.length);
  });
});
