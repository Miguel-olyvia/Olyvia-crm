import { describe, expect, it, vi } from "vitest";
import {
  fraseAssinaturaUnica,
  inserirAntesDoBlocoDeAssinatura,
  isDecorativeLine,
  localizarAssinaturas,
  removerBlocoDeAssinatura,
  temBlocoDeAssinatura,
} from "../assinaturas";
import { IDIOMAS } from "../registo";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const COLUNA = (rotulo: string) =>
  `<div style="flex:1;text-align:center;"><div style="border-bottom:1px solid #000;margin-bottom:8px;height:40px;"></div><p><strong>${rotulo}</strong></p></div>`;

const BLOCO_PT = `<div style="margin-top:40px;"><div style="display:flex;gap:60px;">${COLUNA("A MUDELAR, LDA.")}${COLUNA("O CLIENTE")}</div></div>`;
const BLOCO_EN = `<div style="margin-top:40px;"><div style="display:flex;gap:60px;">${COLUNA("MUDELAR, LDA.")}${COLUNA("THE CLIENT")}</div></div>`;
const EMPREITA = `<div style="text-align:left;"><font>Pontinha, </font><span>06/08/2026</span><br>${BLOCO_PT}</div>`;
const FLAT = `<p>_______________________ _______________________</p><p>A PRIMEIRA CONTRATANTE&nbsp;&nbsp;&nbsp;O SEGUNDO CONTRATANTE</p>`;
const MARCADO = `<div class="olv-assinaturas"><div class="olv-assinatura-empresa"><p>Pela empresa</p></div><div class="olv-assinatura-cliente"><p>Pelo cliente</p></div></div>`;
const SEM_BLOCO = `<h2>CONTRATO</h2><p>O CLIENTE obriga-se a pagar o preço acordado no prazo estabelecido na proposta, sem prejuízo do disposto na cláusula anterior e demais legislação aplicável ao presente contrato.</p>`;

describe("temBlocoDeAssinatura", () => {
  it("deteta o bloco em duas colunas em português e em inglês", () => {
    expect(temBlocoDeAssinatura(`<p>x</p>${BLOCO_PT}`)).toBe(true);
    expect(temBlocoDeAssinatura(`<p>x</p>${BLOCO_EN}`, "en")).toBe(true);
    expect(temBlocoDeAssinatura(BLOCO_EN, "en")).toBe(true);
    expect(temBlocoDeAssinatura(BLOCO_PT, "pt")).toBe(true);
  });

  it("deteta o bloco plano antigo e o aninhado em texto solto", () => {
    expect(temBlocoDeAssinatura(FLAT)).toBe(true);
    expect(temBlocoDeAssinatura(EMPREITA)).toBe(true);
  });

  it("deteta as marcas por classe, mesmo sem frases reconhecíveis", () => {
    expect(temBlocoDeAssinatura(MARCADO)).toBe(true);
    expect(temBlocoDeAssinatura(`<div class="olv-assinatura-cliente"><p>x</p></div>`)).toBe(true);
  });

  it("não confunde uma cláusula que menciona o cliente com o bloco", () => {
    expect(temBlocoDeAssinatura(SEM_BLOCO)).toBe(false);
    expect(temBlocoDeAssinatura("")).toBe(false);
    expect(temBlocoDeAssinatura("<p>nada</p>")).toBe(false);
  });

  it("com idioma explícito procura-se só nele e no base; os outros só se forem pedidos na lista", () => {
    expect(temBlocoDeAssinatura(BLOCO_EN, "pt")).toBe(false);
    expect(temBlocoDeAssinatura(BLOCO_PT, "en")).toBe(true);
    expect(temBlocoDeAssinatura(BLOCO_EN, "pt", ["pt", "en"])).toBe(true);
  });

  it("sem idioma (chamadas antigas) é só o português de hoje", () => {
    expect(temBlocoDeAssinatura(BLOCO_EN)).toBe(false);
    expect(temBlocoDeAssinatura(`<p>x</p>${BLOCO_PT}`)).toBe(true);
  });
});

describe("removerBlocoDeAssinatura", () => {
  it("tira o bloco e o embrulho que só o continha", () => {
    const r = removerBlocoDeAssinatura(`<p>Cláusula 1.</p>${BLOCO_PT}`);
    expect(r.removido).toBe(true);
    expect(r.html).toContain("Cláusula 1.");
    expect(r.html).not.toContain("O CLIENTE");
    expect(r.html).not.toContain("border-bottom");
    expect(r.html).not.toContain("margin-top:40px");
  });

  it("no inglês", () => {
    const r = removerBlocoDeAssinatura(`<p>Clause 1.</p>${BLOCO_EN}`, "en");
    expect(r.removido).toBe(true);
    expect(r.html).toContain("Clause 1.");
    expect(r.html).not.toContain("THE CLIENT");
  });

  it("tira as linhas decorativas (underscores) que antecedem o bloco plano, mas não o texto", () => {
    const r = removerBlocoDeAssinatura(`<p>Lisboa, 13 de Março</p>${FLAT}`);
    expect(r.removido).toBe(true);
    expect(r.html).toContain("Lisboa, 13 de Março");
    expect(r.html).not.toContain("____");
    expect(r.html).not.toContain("PRIMEIRA CONTRATANTE");
  });

  it("não leva o texto solto que partilha o contentor", () => {
    const r = removerBlocoDeAssinatura(EMPREITA);
    expect(r.removido).toBe(true);
    expect(r.html).toContain("Pontinha");
    expect(r.html).toContain("06/08/2026");
    expect(r.html).not.toContain("O CLIENTE");
  });

  it("remove o contentor marcado por classe", () => {
    const r = removerBlocoDeAssinatura(`<p>Fim.</p>${MARCADO}`);
    expect(r.removido).toBe(true);
    expect(r.html).toContain("Fim.");
    expect(r.html).not.toContain("olv-assinatura");
    expect(r.html).not.toContain("Pelo cliente");
  });

  it("sem bloco devolve o html tal e qual", () => {
    const r = removerBlocoDeAssinatura(SEM_BLOCO);
    expect(r.removido).toBe(false);
    expect(r.html).toBe(SEM_BLOCO);
    expect(removerBlocoDeAssinatura("").html).toBe("");
  });
});

describe("inserirAntesDoBlocoDeAssinatura", () => {
  it("põe o fragmento antes do bloco e antes das suas linhas decorativas", () => {
    const r = inserirAntesDoBlocoDeAssinatura(`<p>Lisboa</p>${FLAT}`, `<p id="frase">FRASE</p>`);
    expect(r.inserido).toBe(true);
    expect(r.html.indexOf("FRASE")).toBeGreaterThan(r.html.indexOf("Lisboa"));
    expect(r.html.indexOf("FRASE")).toBeLessThan(r.html.indexOf("____"));
    expect(r.html.indexOf("FRASE")).toBeLessThan(r.html.indexOf("PRIMEIRA CONTRATANTE"));
  });

  it("em duas colunas, fica antes do embrulho e o bloco mantém-se", () => {
    const r = inserirAntesDoBlocoDeAssinatura(`<p>Clause</p>${BLOCO_EN}`, "<p>FRASE</p>", "en");
    expect(r.inserido).toBe(true);
    expect(r.html.indexOf("FRASE")).toBeLessThan(r.html.indexOf("THE CLIENT"));
    expect(r.html.indexOf("FRASE")).toBeLessThan(r.html.indexOf("margin-top:40px"));
    expect(r.html).toContain("MUDELAR, LDA.");
  });

  it("sem bloco não insere nada", () => {
    const r = inserirAntesDoBlocoDeAssinatura(SEM_BLOCO, "<p>FRASE</p>");
    expect(r.inserido).toBe(false);
    expect(r.html).toBe(SEM_BLOCO);
  });
});

describe("fraseAssinaturaUnica", () => {
  it("português e inglês: a frase exata do desenho", () => {
    expect(fraseAssinaturaUnica(["pt", "en"])).toBe(
      "Esta assinatura vale para as versões em português e em inglês. / This signature applies to both the Portuguese and English versions.",
    );
  });

  it("três idiomas", () => {
    const f = fraseAssinaturaUnica(["pt", "en", "es"]);
    expect(f).toContain("Esta assinatura vale para as versões em português, em inglês e em espanhol.");
    expect(f).toContain("This signature applies to the Portuguese, English and Spanish versions.");
  });

  it("idiomas sem dicionário próprio não repetem a frase portuguesa", () => {
    const f = fraseAssinaturaUnica(["pt", "es"]);
    expect(f.split("Esta assinatura vale").length - 1).toBe(1);
  });

  it("um só idioma: vazio", () => {
    expect(fraseAssinaturaUnica(["pt"])).toBe("");
    expect(fraseAssinaturaUnica([])).toBe("");
  });
});

describe("paridade com a deteção de injectSignaturesIntoBlock (contractDocument.ts)", () => {
  it("onde ele injeta o carimbo há bloco; onde não injeta, não há", async () => {
    const { injectSignaturesIntoBlock } = await import("@/components/contracts/contractDocument");
    const assinado = { signed: true, name: "Alguém", showOtpBadge: false };
    const casos: Array<[string, string]> = [
      ["colunas", BLOCO_PT],
      ["empreita", EMPREITA],
      ["plano", FLAT],
      ["sem bloco", SEM_BLOCO],
      ["texto curto sem estrutura", "<p>O CLIENTE</p>"],
    ];
    for (const [nome, html] of casos) {
      const injetado = injectSignaturesIntoBlock(html, assinado, assinado) !== html;
      expect(temBlocoDeAssinatura(html, "pt"), nome).toBe(injetado);
    }
  });

  it("as frases do português no registo são exatamente as de contractDocument.ts", () => {
    const pt = IDIOMAS.find((i) => i.codigo === "pt")!.assinatura!;
    expect(pt.segundaParte.source).toBe("O SEGUNDO CONTRATANTE|\\bO CLIENTE\\b");
    expect(pt.segundaParte.flags).toBe("i");
    expect(pt.primeiraParte.source).toBe("A PRIMEIRA CONTRATANTE");
    expect(pt.primeiraParte.flags).toBe("i");
  });
});

// ── H1: uma cláusula curta em inglês não é um bloco de assinatura ────────────────────────────────
const CLAUSULA_EN = `<p>The Company shall provide the Services to the Client.</p>`;
const CORPO_EN = `<h2>SERVICES AGREEMENT</h2>${CLAUSULA_EN}<p>Clause 2. Payment is due in 30 days.</p><p>Clause 3. Governing law.</p><p>Clause 4. Notices.</p><p>Clause 5. Term.</p>`;
const PLANO_EN_FIM = `<p>Clause 1.</p><p>London, 13 March 2026</p><p>_______________________</p><p>THE FIRST PARTY&nbsp;&nbsp;&nbsp;THE SECOND PARTY</p>`;

describe("H1 — o bloco plano em inglês só vale no fim do corpo e com linha de assinatura", () => {
  it("a cláusula curta com as duas partes, no meio do corpo, não é tocada por deteção, remoção nem inserção", () => {
    expect(temBlocoDeAssinatura(CORPO_EN, "en")).toBe(false);
    const r = removerBlocoDeAssinatura(CORPO_EN, "en");
    expect(r.removido).toBe(false);
    expect(r.html).toBe(CORPO_EN);
    const i = inserirAntesDoBlocoDeAssinatura(CORPO_EN, "<p>FRASE</p>", "en");
    expect(i.inserido).toBe(false);
    expect(i.html).toBe(CORPO_EN);
  });

  it("a mesma cláusula no fim do corpo, sem linha de assinatura, também não conta", () => {
    expect(temBlocoDeAssinatura(`<p>Clause 1.</p>${CLAUSULA_EN}`, "en")).toBe(false);
  });

  it("uma etiqueta com as duas partes e uma linha, mas no meio do corpo, não conta", () => {
    const meio = `<p>_____________</p><p>THE FIRST PARTY   THE SECOND PARTY</p>${"<p>Clause.</p>".repeat(5)}`;
    expect(temBlocoDeAssinatura(meio, "en")).toBe(false);
  });

  it("o bloco real no fim, com linha, continua a ser detetado (colunas e plano)", () => {
    expect(temBlocoDeAssinatura(`<p>Clause</p>${BLOCO_EN}`, "en")).toBe(true);
    expect(temBlocoDeAssinatura(PLANO_EN_FIM, "en")).toBe(true);
    expect(inserirAntesDoBlocoDeAssinatura(PLANO_EN_FIM, "<p>FRASE</p>", "en").inserido).toBe(true);
  });

  it("o plano em inglês, só com a heurística, nunca é REMOVIDO (só marcas ou colunas)", () => {
    const r = removerBlocoDeAssinatura(PLANO_EN_FIM, "en");
    expect(r.removido).toBe(false);
    expect(r.html).toBe(PLANO_EN_FIM);
  });

  it("as colunas em inglês e as marcas continuam a poder ser removidas", () => {
    expect(removerBlocoDeAssinatura(`<p>Clause</p>${BLOCO_EN}`, "en").removido).toBe(true);
    expect(removerBlocoDeAssinatura(`<p>Fim.</p>${MARCADO}`, "en").removido).toBe(true);
  });

  it("o português fica como hoje: o plano antigo é aceite mesmo no meio e sem linha", () => {
    const meio = `<p>A PRIMEIRA CONTRATANTE   O SEGUNDO CONTRATANTE</p>${"<p>x</p>".repeat(6)}`;
    expect(temBlocoDeAssinatura(meio, "pt")).toBe(true);
    expect(removerBlocoDeAssinatura(meio, "pt").removido).toBe(true);
  });
});

// ── H2: o português não procura nos outros idiomas ───────────────────────────────────────────────
describe("H2 — um texto em inglês solto num contrato em português não é tocado", () => {
  const PT_COM_INGLES = `<p>Lisboa</p><p>The Client signs here</p><p>THE COMPANY and THE CLIENT agree.</p>`;
  it("nem por omissão nem com idioma pt", () => {
    expect(temBlocoDeAssinatura(PT_COM_INGLES)).toBe(false);
    expect(temBlocoDeAssinatura(PT_COM_INGLES, "pt")).toBe(false);
    expect(removerBlocoDeAssinatura(PT_COM_INGLES, "pt").html).toBe(PT_COM_INGLES);
  });
});

// ── M1: só as linhas puramente decorativas ────────────────────────────────────────────────────────
describe("M1 — isDecorativeLine", () => {
  const el = (html: string) => {
    const t = document.createElement("template");
    t.innerHTML = html;
    return t.content.firstElementChild;
  };
  it("aceita sublinhados, traços, espaços e <br>", () => {
    expect(isDecorativeLine(el("<p>_______</p>"))).toBe(true);
    expect(isDecorativeLine(el("<p>&nbsp;<br></p>"))).toBe(true);
    expect(isDecorativeLine(el("<div> — – - </div>"))).toBe(true);
    expect(isDecorativeLine(el("<p></p>"))).toBe(true);
  });
  it("nunca com imagem, svg, tabela ou canvas, nem com texto", () => {
    expect(isDecorativeLine(el(`<p><img src="rubrica.png"></p>`))).toBe(false);
    expect(isDecorativeLine(el("<div><table><tr><td></td></tr></table></div>"))).toBe(false);
    expect(isDecorativeLine(el(`<div><svg width="1"></svg></div>`))).toBe(false);
    expect(isDecorativeLine(el("<p><canvas></canvas></p>"))).toBe(false);
    expect(isDecorativeLine(el("<p>texto</p>"))).toBe(false);
    expect(isDecorativeLine(null)).toBe(false);
  });
  it("a rúbrica antes do bloco não é apagada pela remoção", () => {
    const r = removerBlocoDeAssinatura(`<p>Lisboa</p><p><img src="rubrica.png"></p>${FLAT}`);
    expect(r.removido).toBe(true);
    expect(r.html).toContain("rubrica.png");
    expect(r.html).not.toContain("____");
  });
});

// ── M3: uma só localização, com as marcas tratadas por igual ─────────────────────────────────────
const LINHA = `<div style="border-bottom:1px solid #000;height:40px;"></div>`;
describe("M3 — localizarAssinaturas unifica as marcas", () => {
  const raiz = (html: string) => {
    const t = document.createElement("template");
    t.innerHTML = html;
    return t.content;
  };

  it("só o contentor marcado: as duas colunas diretas são a empresa e o cliente", () => {
    const html = `<div class="olv-assinaturas"><div>${LINHA}<p>Pela empresa</p></div><div>${LINHA}<p>Pelo cliente</p></div></div>`;
    const loc = localizarAssinaturas(raiz(html));
    expect(loc?.tipo).toBe("colunas");
    if (loc?.tipo === "colunas") {
      expect(loc.empresa?.textContent).toContain("Pela empresa");
      expect(loc.cliente?.textContent).toContain("Pelo cliente");
      expect(loc.elementos).toHaveLength(1);
    }
  });

  it("só a coluna do cliente marcada: a irmã com linha é a da empresa", () => {
    const html = `<div style="display:flex"><div>${LINHA}<p>Pela empresa</p></div><div class="olv-assinatura-cliente">${LINHA}<p>Pelo cliente</p></div></div>`;
    const loc = localizarAssinaturas(raiz(html));
    expect(loc?.tipo === "colunas" && loc.empresa?.textContent).toContain("Pela empresa");
  });

  it("as duas colunas marcadas ao nível do topo: remove-se cada uma, sem falhar", () => {
    const html = `<p>Fim do texto.</p><div class="olv-assinatura-empresa">${LINHA}<p>Pela empresa</p></div><div class="olv-assinatura-cliente">${LINHA}<p>Pelo cliente</p></div>`;
    const r = removerBlocoDeAssinatura(html);
    expect(r.removido).toBe(true);
    expect(r.html).toContain("Fim do texto.");
    expect(r.html).not.toContain("Pela empresa");
    expect(r.html).not.toContain("Pelo cliente");
  });

  it("as colunas marcadas dentro de um contentor com outro texto: só as colunas saem", () => {
    const html = `<div><p>Cláusula longa que não pode desaparecer.</p><div class="olv-assinatura-empresa">${LINHA}<p>E</p></div><div class="olv-assinatura-cliente">${LINHA}<p>C</p></div></div>`;
    const r = removerBlocoDeAssinatura(html);
    expect(r.removido).toBe(true);
    expect(r.html).toContain("Cláusula longa");
    expect(r.html).not.toContain(">E<");
    expect(r.html).not.toContain(">C<");
  });

  it("sem marcas, as frases do idioma achadas em colunas", () => {
    const loc = localizarAssinaturas(raiz(BLOCO_EN), { idioma: "en" });
    expect(loc?.tipo).toBe("colunas");
    expect(localizarAssinaturas(raiz(BLOCO_EN))).toBeNull();
  });
});
