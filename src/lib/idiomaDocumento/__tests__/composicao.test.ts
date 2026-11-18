import { describe, expect, it } from "vitest";
import { comporCorpoDoContrato, dividirEmVersoes } from "../composicao";

const COLUNA = (rotulo: string) =>
  `<div style="flex:1;"><div style="border-bottom:1px solid #000;height:40px;"></div><p><strong>${rotulo}</strong></p></div>`;
const BLOCO_PT = `<div style="margin-top:40px;"><div style="display:flex;">${COLUNA("A MUDELAR, LDA.")}${COLUNA("O CLIENTE")}</div></div>`;
const BLOCO_EN = `<div style="margin-top:40px;"><div style="display:flex;">${COLUNA("MUDELAR, LDA.")}${COLUNA("THE CLIENT")}</div></div>`;

const PT_SEM_ASSINATURA = "<h2>CONTRATO</h2><p>Cláusula 1 para {{cliente_nome}}.</p>";
const EN_SEM_ASSINATURA = "<h2>SERVICES AGREEMENT</h2><p>Clause 1 for {{cliente_nome}}.</p>";

function minuta(opcoes: { pt?: string; en?: string; es?: string; language?: string } = {}) {
  const versions: Record<string, unknown> = {};
  if (opcoes.en !== undefined) versions.en = { body_html: opcoes.en };
  if (opcoes.es !== undefined) versions.es = { body_html: opcoes.es };
  return {
    ...(opcoes.language ? { language: opcoes.language } : {}),
    body_html: opcoes.pt ?? PT_SEM_ASSINATURA,
    doc_settings: { versions },
  };
}

describe("dividirEmVersoes", () => {
  it("corpo sem marcas: um só segmento em português, com o html intacto", () => {
    const html = "<h2>CONTRATO</h2><div><p>x</p></div>";
    expect(dividirEmVersoes(html)).toEqual([{ codigo: "pt", html }]);
  });

  it("o idioma do segmento sem marcas pode ser indicado", () => {
    expect(dividirEmVersoes("<p>x</p>", "en")).toEqual([{ codigo: "en", html: "<p>x</p>" }]);
  });

  it("vazio, nulo ou indefinido: um segmento vazio", () => {
    expect(dividirEmVersoes("")).toEqual([{ codigo: "pt", html: "" }]);
    expect(dividirEmVersoes(null)).toEqual([{ codigo: "pt", html: "" }]);
    expect(dividirEmVersoes(undefined)).toEqual([{ codigo: "pt", html: "" }]);
  });

  it("divide pelas marcas olv-versao, mesmo com divs dentro de cada versão", () => {
    const html =
      `<div class="olv-versao olv-versao-pt"><div><p>um</p></div><p>dois</p></div>` +
      `<div class="olv-versao olv-versao-en" style="break-before:page;page-break-before:always"><div><div>three</div></div></div>`;
    expect(dividirEmVersoes(html)).toEqual([
      { codigo: "pt", html: "<div><p>um</p></div><p>dois</p>" },
      { codigo: "en", html: "<div><div>three</div></div>" },
    ]);
  });

  it("ignora o espaço entre versões e aceita aspas simples e outras classes", () => {
    const html = `<div class='x olv-versao olv-versao-en'><p>a</p></div>\n  <div class="olv-versao olv-versao-pt"><p>b</p></div>`;
    expect(dividirEmVersoes(html)).toEqual([
      { codigo: "en", html: "<p>a</p>" },
      { codigo: "pt", html: "<p>b</p>" },
    ]);
  });

  it("um div com a classe olv-versao dentro de outro div não é um segmento de topo", () => {
    const html = `<div><div class="olv-versao olv-versao-en"><p>a</p></div></div>`;
    expect(dividirEmVersoes(html)).toEqual([{ codigo: "pt", html }]);
  });

  it("não perde texto fora das versões: junta-o à versão vizinha", () => {
    const html = `<p>antes</p><div class="olv-versao olv-versao-pt"><p>b</p></div><p>depois</p>`;
    const r = dividirEmVersoes(html);
    expect(r).toHaveLength(1);
    expect(r[0].html).toContain("antes");
    expect(r[0].html).toContain("depois");
    expect(r[0].html).toContain("<p>b</p>");
  });

  it("código desconhecido na marca: não é segmento (fica como corpo sem marcas)", () => {
    const html = `<div class="olv-versao olv-versao-xx"><p>a</p></div>`;
    expect(dividirEmVersoes(html)).toEqual([{ codigo: "pt", html }]);
  });
});

describe("comporCorpoDoContrato — só o base", () => {
  it("escolha só português: o body_html tal e qual, sem embrulho", () => {
    const t = minuta({ en: EN_SEM_ASSINATURA });
    expect(comporCorpoDoContrato(t, "pt")).toBe(t.body_html);
    expect(comporCorpoDoContrato(t, ["pt"])).toBe(t.body_html);
  });

  it("modelo sem versões, seja qual for a escolha: o body_html tal e qual", () => {
    const t = minuta();
    expect(comporCorpoDoContrato(t, "pt")).toBe(t.body_html);
    expect(comporCorpoDoContrato(t, "en")).toBe(t.body_html);
    expect(comporCorpoDoContrato(t, "pt+en")).toBe(t.body_html);
  });

  it("escolha vazia ou inválida: o body_html tal e qual", () => {
    const t = minuta({ en: EN_SEM_ASSINATURA });
    expect(comporCorpoDoContrato(t, null)).toBe(t.body_html);
    expect(comporCorpoDoContrato(t, "")).toBe(t.body_html);
    expect(comporCorpoDoContrato(t, "xx")).toBe(t.body_html);
  });

  it("idioma pedido que o modelo não tem é ignorado", () => {
    const t = minuta({ en: EN_SEM_ASSINATURA });
    expect(comporCorpoDoContrato(t, "es")).toBe(t.body_html);
    const dois = comporCorpoDoContrato(t, "pt+es");
    expect(dois).toBe(t.body_html);
  });

  it("corpo nulo: texto vazio", () => {
    expect(comporCorpoDoContrato({ body_html: null, doc_settings: null }, "pt")).toBe("");
    expect(comporCorpoDoContrato(null, "pt")).toBe("");
  });

  it("idioma base inglês e escolha inglês: o body_html tal e qual", () => {
    const t = { language: "en", body_html: EN_SEM_ASSINATURA, doc_settings: {} };
    expect(comporCorpoDoContrato(t, "en")).toBe(EN_SEM_ASSINATURA);
  });
});

describe("comporCorpoDoContrato — com versões", () => {
  it("só inglês: embrulho da versão, sem quebra de página (é a primeira)", () => {
    const t = minuta({ en: EN_SEM_ASSINATURA });
    expect(comporCorpoDoContrato(t, "en")).toBe(`<div class="olv-versao olv-versao-en">${EN_SEM_ASSINATURA}</div>`);
  });

  it("os dois: português primeiro, inglês a seguir com quebra de página", () => {
    const t = minuta({ en: EN_SEM_ASSINATURA });
    const out = comporCorpoDoContrato(t, "pt+en");
    expect(out).toBe(
      `<div class="olv-versao olv-versao-pt">${PT_SEM_ASSINATURA}</div>\n` +
        `<div class="olv-versao olv-versao-en" style="break-before:page;page-break-before:always">${EN_SEM_ASSINATURA}</div>`,
    );
  });

  it("a ordem é a do registo, mesmo que a escolha venha invertida", () => {
    const t = minuta({ en: EN_SEM_ASSINATURA });
    const out = comporCorpoDoContrato(t, "en+pt");
    expect(out.indexOf("olv-versao-pt")).toBeLessThan(out.indexOf("olv-versao-en"));
    expect(out.indexOf("break-before")).toBeGreaterThan(out.indexOf("olv-versao-pt"));
  });

  it("três idiomas: só a primeira não leva quebra de página", () => {
    const t = minuta({ en: EN_SEM_ASSINATURA, es: "<h2>CONTRATO ES</h2><p>Hola</p>" });
    const out = comporCorpoDoContrato(t, "pt+en+es");
    expect(out.match(/break-before:page/g)).toHaveLength(2);
    expect(dividirEmVersoes(out).map((s) => s.codigo)).toEqual(["pt", "en", "es"]);
  });

  it("dividir devolve o que compor embrulhou (sem assinaturas pelo meio)", () => {
    const t = minuta({ en: EN_SEM_ASSINATURA });
    expect(dividirEmVersoes(comporCorpoDoContrato(t, "pt+en"))).toEqual([
      { codigo: "pt", html: PT_SEM_ASSINATURA },
      { codigo: "en", html: EN_SEM_ASSINATURA },
    ]);
  });

  it("não muda o modelo", () => {
    const t = minuta({ en: EN_SEM_ASSINATURA });
    const antes = JSON.stringify(t);
    comporCorpoDoContrato(t, "pt+en");
    expect(JSON.stringify(t)).toBe(antes);
  });
});

describe("comporCorpoDoContrato — assinatura única", () => {
  const FRASE_PT = "Esta assinatura vale para as versões em português e em inglês.";
  const FRASE_EN = "This signature applies to both the Portuguese and English versions.";

  it("tira o bloco da versão portuguesa e deixa só o da última que o tem", () => {
    const t = minuta({ pt: `${PT_SEM_ASSINATURA}${BLOCO_PT}`, en: `${EN_SEM_ASSINATURA}${BLOCO_EN}` });
    const [pt, en] = dividirEmVersoes(comporCorpoDoContrato(t, "pt+en"));
    expect(pt.html).toContain("Cláusula 1");
    expect(pt.html).not.toContain("O CLIENTE");
    expect(pt.html).not.toContain("border-bottom");
    expect(en.html).toContain("THE CLIENT");
    expect(en.html.match(/border-bottom/g)).toHaveLength(2);
  });

  it("a frase bilingue entra antes do bloco que ficou", () => {
    const t = minuta({ pt: `${PT_SEM_ASSINATURA}${BLOCO_PT}`, en: `${EN_SEM_ASSINATURA}${BLOCO_EN}` });
    const [, en] = dividirEmVersoes(comporCorpoDoContrato(t, "pt+en"));
    expect(en.html).toContain(`${FRASE_PT} / ${FRASE_EN}`);
    expect(en.html.indexOf(FRASE_PT)).toBeGreaterThan(en.html.indexOf("Clause 1"));
    expect(en.html.indexOf(FRASE_PT)).toBeLessThan(en.html.indexOf("THE CLIENT"));
  });

  it("a frase aparece uma só vez", () => {
    const t = minuta({ pt: `${PT_SEM_ASSINATURA}${BLOCO_PT}`, en: `${EN_SEM_ASSINATURA}${BLOCO_EN}` });
    const out = comporCorpoDoContrato(t, "pt+en");
    expect(out.split(FRASE_PT).length - 1).toBe(1);
    expect(out.split(FRASE_EN).length - 1).toBe(1);
  });

  it("se só a versão portuguesa tem o bloco, é ela que o guarda (a última que o tem)", () => {
    const t = minuta({ pt: `${PT_SEM_ASSINATURA}${BLOCO_PT}`, en: EN_SEM_ASSINATURA });
    const [pt, en] = dividirEmVersoes(comporCorpoDoContrato(t, "pt+en"));
    expect(pt.html).toContain("O CLIENTE");
    expect(pt.html).toContain(FRASE_PT);
    expect(en.html).toBe(EN_SEM_ASSINATURA);
  });

  it("nenhuma versão tem bloco: nada é removido nem acrescentado", () => {
    const t = minuta({ en: EN_SEM_ASSINATURA });
    const out = comporCorpoDoContrato(t, "pt+en");
    expect(out).not.toContain("Esta assinatura");
  });

  it("com um só idioma o bloco fica intacto e não há frase", () => {
    const t = minuta({ pt: `${PT_SEM_ASSINATURA}${BLOCO_PT}`, en: `${EN_SEM_ASSINATURA}${BLOCO_EN}` });
    const so_en = comporCorpoDoContrato(t, "en");
    expect(so_en).toContain("THE CLIENT");
    expect(so_en).not.toContain("Esta assinatura");
    expect(comporCorpoDoContrato(t, "pt")).toBe(t.body_html);
  });

  it("as assinaturas marcadas por classe também contam", () => {
    const marcado = (txt: string) =>
      `<div class="olv-assinaturas"><div class="olv-assinatura-empresa"><p>${txt}</p></div><div class="olv-assinatura-cliente"><p>${txt}</p></div></div>`;
    const t = minuta({ pt: `${PT_SEM_ASSINATURA}${marcado("Assinar PT")}`, en: `${EN_SEM_ASSINATURA}${marcado("Sign EN")}` });
    const out = comporCorpoDoContrato(t, "pt+en");
    expect(out).not.toContain("Assinar PT");
    expect(out).toContain("Sign EN");
    expect(out).toContain(FRASE_PT);
  });
});

describe("dividirEmVersoes — html desequilibrado e marcas à mão (M8)", () => {
  const V = (c: string, corpo: string) => `<div class="olv-versao olv-versao-${c}">${corpo}</div>`;

  it("um div sem fecho dentro de uma versão não faz perder as seguintes", () => {
    const html = `${V("pt", "<div><p>um</p>")}
${V("en", "<p>two</p>")}`;
    const r = dividirEmVersoes(html);
    expect(r.map((x) => x.codigo)).toEqual(["pt", "en"]);
    expect(r[0].html).toContain("um");
    expect(r[1].html).toBe("<p>two</p>");
  });

  it("um </div> a mais dentro de uma versão: as duas versões continuam lá, sem perder texto", () => {
    const html = `${V("pt", "<p>um</p></div><p>sobra</p>")}${V("en", "<p>two</p>")}`;
    const r = dividirEmVersoes(html);
    expect(r.map((x) => x.codigo)).toEqual(["pt", "en"]);
    expect(r[0].html).toContain("um");
    expect(r[0].html).toContain("sobra");
    expect(r[1].html).toBe("<p>two</p>");
  });

  it("wrapper escrito à mão: maiúsculas, aspas simples, outros atributos", () => {
    const html = `<DIV id="a" CLASS='olv-versao olv-versao-EN' title="x"><p>hello</p></DIV><div style="x" class="olv-versao olv-versao-pt"><p>olá</p></div>`;
    expect(dividirEmVersoes(html)).toEqual([
      { codigo: "en", html: "<p>hello</p>" },
      { codigo: "pt", html: "<p>olá</p>" },
    ]);
  });

  it("data-class não é uma classe", () => {
    const html = `<div data-class="olv-versao olv-versao-en"><p>a</p></div>`;
    expect(dividirEmVersoes(html)).toEqual([{ codigo: "pt", html }]);
  });

  it("uma só versão com marca: é essa, sem o wrapper", () => {
    expect(dividirEmVersoes(V("en", "<p>only</p>"))).toEqual([{ codigo: "en", html: "<p>only</p>" }]);
  });

  it("uma versão vazia continua a ser uma versão", () => {
    expect(dividirEmVersoes(`${V("pt", "")}${V("en", "<p>x</p>")}`)).toEqual([
      { codigo: "pt", html: "" },
      { codigo: "en", html: "<p>x</p>" },
    ]);
  });

  it("três idiomas, um deles com div sem fecho", () => {
    const html = `${V("pt", "<p>a</p>")}${V("en", "<div><div><p>b</p>")}${V("es", "<p>c</p>")}`;
    expect(dividirEmVersoes(html).map((x) => x.codigo)).toEqual(["pt", "en", "es"]);
    expect(dividirEmVersoes(html)[2].html).toBe("<p>c</p>");
  });

  it("html sem fecho do próprio wrapper (fim do texto): a versão fecha no fim", () => {
    const r = dividirEmVersoes(`<div class="olv-versao olv-versao-pt"><p>a</p>`);
    expect(r).toEqual([{ codigo: "pt", html: "<p>a</p>" }]);
  });

  it("uma versão com div sem fecho sai equilibrada (pode voltar a embrulhar-se)", () => {
    const r = dividirEmVersoes(`${V("pt", "<div><p>um</p>")}${V("en", "<p>two</p>")}`);
    const abertos = (r[0].html.match(/<div/gi) ?? []).length;
    const fechados = (r[0].html.match(/<\/div>/gi) ?? []).length;
    expect(abertos).toBe(fechados);
  });
});

describe("comporCorpoDoContrato — H1, M-baixos", () => {
  const FRASE_PT = "Esta assinatura vale para as versões em português e em inglês.";
  const CLAUSULA_EN = "<p>The Company shall provide the Services to the Client.</p>";

  it("uma cláusula curta em inglês no meio do corpo não é apagada pela composição", () => {
    const en = `<h2>AGREEMENT</h2>${CLAUSULA_EN}${"<p>Clause.</p>".repeat(5)}`;
    const t = minuta({ pt: `${PT_SEM_ASSINATURA}${BLOCO_PT}`, en });
    const [pt, ing] = dividirEmVersoes(comporCorpoDoContrato(t, "pt+en"));
    expect(ing.html).toContain("The Company shall provide");
    // a última versão não tem bloco identificável: a assinatura portuguesa fica onde estava, com a sua frase
    expect(pt.html).toContain("O CLIENTE");
  });

  it("o plano em inglês no fim, só com a heurística, não é apagado pela composição (a assinatura não fica a meio)", () => {
    const plano = `<p>Clause 1.</p><p>_______________________</p><p>THE FIRST PARTY  THE SECOND PARTY</p>`;
    const t = minuta({ pt: `${PT_SEM_ASSINATURA}${BLOCO_PT}`, en: plano });
    const out = comporCorpoDoContrato(t, "pt+en");
    expect(out).toContain("THE SECOND PARTY");
  });

  it("quando a última versão (es) não tem expressões de assinatura, não se remove nada", () => {
    const t = minuta({ pt: `${PT_SEM_ASSINATURA}${BLOCO_PT}`, en: `${EN_SEM_ASSINATURA}${BLOCO_EN}`, es: "<h2>CONTRATO ES</h2><p>Hola</p>" });
    const out = comporCorpoDoContrato(t, "pt+en+es");
    expect(out).toContain("O CLIENTE");
    expect(out).toContain("THE CLIENT");
    expect(out).not.toContain(FRASE_PT);
  });

  it("corpo base vazio com versão inglesa cheia: só a versão inglesa, sem uma primeira página vazia", () => {
    const t = minuta({ pt: "", en: EN_SEM_ASSINATURA });
    expect(comporCorpoDoContrato(t, "pt+en")).toBe(`<div class="olv-versao olv-versao-en">${EN_SEM_ASSINATURA}</div>`);
  });
});
