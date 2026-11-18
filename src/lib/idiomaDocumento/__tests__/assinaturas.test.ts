import { describe, expect, it, vi } from "vitest";
import {
  fraseAssinaturaUnica,
  inserirAntesDoBlocoDeAssinatura,
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
    expect(temBlocoDeAssinatura(`<p>x</p>${BLOCO_EN}`)).toBe(true);
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

  it("o idioma da versão vem primeiro, mas as frases dos outros idiomas servem de último recurso", () => {
    expect(temBlocoDeAssinatura(BLOCO_EN, "pt")).toBe(true);
    expect(temBlocoDeAssinatura(BLOCO_PT, "en")).toBe(true);
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
