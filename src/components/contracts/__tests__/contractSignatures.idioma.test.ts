import { describe, expect, it, vi } from "vitest";
import {
  hasSignatoryHook,
  injectSignatoryIntoSignatureBlock,
  injectSignaturesIntoBlock,
} from "../contractDocument";
import { comporCorpoDoContrato } from "@/lib/idiomaDocumento";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const LINHA = `<div style="border-bottom:1px solid #000;margin-bottom:8px;height:40px;"></div>`;
const COLUNA = (rotulo: string) => `<div style="flex:1;text-align:center;">${LINHA}<p><strong>${rotulo}</strong></p></div>`;

const BLOCO_PT = `<div style="margin-top:40px;"><div style="display:flex;gap:60px;">${COLUNA("A MUDELAR, LDA.")}${COLUNA("O CLIENTE")}</div></div>`;
const BLOCO_EN = `<div style="margin-top:40px;"><div style="display:flex;gap:60px;">${COLUNA("MUDELAR, LDA. (THE COMPANY)")}${COLUNA("THE CLIENT")}</div></div>`;
const BLOCO_MARCADO = `<div class="olv-assinaturas"><div class="olv-assinatura-empresa">${LINHA}<p>Pela empresa</p></div><div class="olv-assinatura-cliente">${LINHA}<p>Pelo cliente</p></div></div>`;
const PLANO_EN = `<p>London, 13 March 2026</p><p>_______________________</p><p>THE FIRST PARTY&nbsp;&nbsp;&nbsp;THE SECOND PARTY</p>`;

const EMPRESA = { signed: true, name: "Ricardo Belchior", showOtpBadge: false } as const;
const CLIENTE = { signed: true, name: "Daniel Paixao", signedAt: "2026-08-06T20:15:00.000Z", ip: "185.128.9.205", showOtpBadge: true } as const;
const POR_ASSINAR = { signed: false, showOtpBadge: true } as const;

describe("injectSignaturesIntoBlock — marcas por classe", () => {
  it("põe cada carimbo na sua coluna marcada, mesmo sem frases reconhecíveis", () => {
    const out = injectSignaturesIntoBlock(BLOCO_MARCADO, EMPRESA, CLIENTE);
    expect(out.indexOf("Ricardo Belchior")).toBeGreaterThan(-1);
    expect(out.indexOf("Ricardo Belchior")).toBeLessThan(out.indexOf("Pela empresa"));
    expect(out.indexOf("Assinado via SMS OTP")).toBeGreaterThan(out.indexOf("Pela empresa"));
    expect(out.indexOf("Assinado via SMS OTP")).toBeLessThan(out.indexOf("Pelo cliente"));
    expect(out).toContain("Daniel Paixao");
  });

  it("as marcas ganham a uma frase solta que menciona as duas partes", () => {
    const frase = `<p>A PRIMEIRA CONTRATANTE e O SEGUNDO CONTRATANTE celebram o presente contrato.</p>`;
    const out = injectSignaturesIntoBlock(`${frase}${BLOCO_MARCADO}`, EMPRESA, POR_ASSINAR);
    expect(out.indexOf("Ricardo Belchior")).toBeGreaterThan(out.indexOf("celebram"));
    expect(out).not.toMatch(/celebram[^<]*Ricardo/);
  });

  it("só uma coluna marcada: carimba essa e deixa a outra", () => {
    const so = `<div class="olv-assinatura-cliente">${LINHA}<p>Pelo cliente</p></div>`;
    const out = injectSignaturesIntoBlock(so, EMPRESA, CLIENTE);
    expect(out).toContain("Assinado via SMS OTP");
    expect(out).not.toContain("Brush Script");
  });

  it("nada assinado: devolve o html tal e qual", () => {
    expect(injectSignaturesIntoBlock(BLOCO_MARCADO, { signed: false }, { signed: false })).toBe(BLOCO_MARCADO);
  });
});

describe("injectSignaturesIntoBlock — blocos em inglês", () => {
  it("deteta «THE CLIENT» e escreve o carimbo em inglês quando o idioma é en", () => {
    const out = injectSignaturesIntoBlock(BLOCO_EN, EMPRESA, CLIENTE, "en");
    expect(out).toContain("Signed via SMS OTP");
    expect(out).not.toContain("Assinado via SMS OTP");
    expect(out).toContain("IP: 185.128.9.205");
    expect(out).toMatch(/\d{2} August 2026/);
    expect(out.indexOf("Ricardo Belchior")).toBeLessThan(out.indexOf("(THE COMPANY)"));
    expect(out.indexOf("Signed via SMS OTP")).toBeLessThan(out.indexOf("THE CLIENT"));
  });

  it("a assinatura da empresa sem nome diz «Signed» em inglês", () => {
    const out = injectSignaturesIntoBlock(BLOCO_EN, { signed: true, showOtpBadge: false }, POR_ASSINAR, "en");
    expect(out).toContain(">Signed<");
    expect(out).not.toContain(">Assinado<");
  });

  it("sem dizer o idioma (chamadas antigas) procura-se só em português: o bloco em inglês fica como está", () => {
    expect(injectSignaturesIntoBlock(BLOCO_EN, EMPRESA, CLIENTE)).toBe(BLOCO_EN);
  });

  it("só se procura em inglês quando o idioma ou a lista de idiomas o pede", () => {
    expect(injectSignaturesIntoBlock(BLOCO_EN, EMPRESA, CLIENTE, "pt")).toBe(BLOCO_EN);
    const out = injectSignaturesIntoBlock(BLOCO_EN, EMPRESA, CLIENTE, "pt", ["pt", "en"]);
    expect(out.indexOf("Ricardo Belchior")).toBeLessThan(out.indexOf("(THE COMPANY)"));
  });

  it("o bloco plano em inglês é refeito com as etiquetas em inglês", () => {
    const out = injectSignaturesIntoBlock(PLANO_EN, EMPRESA, CLIENTE, "en");
    expect(out).toContain("THE FIRST PARTY");
    expect(out).toContain("THE SECOND PARTY");
    expect(out).not.toContain("PRIMEIRA CONTRATANTE");
    expect(out).toContain("Signed via SMS OTP");
  });

  it("o bloco em português continua a ser achado primeiro, mesmo com idioma en no pedido", () => {
    const out = injectSignaturesIntoBlock(BLOCO_PT, EMPRESA, CLIENTE, "en");
    expect(out.indexOf("Ricardo Belchior")).toBeLessThan(out.indexOf("A MUDELAR"));
    expect(out).toContain("Signed via SMS OTP");
  });
});

describe("injectSignaturesIntoBlock — documento com os dois idiomas e um só bloco", () => {
  const TEMPLATE = {
    language: "pt",
    body_html: `<h2>CONTRATO</h2><p>Cláusula 1.</p>${BLOCO_PT}`,
    doc_settings: { versions: { en: { body_html: `<h2>AGREEMENT</h2><p>Clause 1.</p>${BLOCO_EN}` } } },
  };

  it("a composição deixa um só bloco e o carimbo sai uma só vez, nos dois idiomas", () => {
    const corpo = comporCorpoDoContrato(TEMPLATE, "pt+en");
    expect(corpo.match(/border-bottom/g)).toHaveLength(2);
    const out = injectSignaturesIntoBlock(corpo, EMPRESA, CLIENTE, "pt", ["pt", "en"]);
    expect(out.match(/Assinado via SMS OTP \/ Signed via SMS OTP/g)).toHaveLength(1);
    expect(out.match(/Brush Script/g)).toHaveLength(1);
    expect(out.match(/IP: 185\.128\.9\.205/g)).toHaveLength(1);
    // a data do carimbo mantém o formato de hoje (a do primeiro idioma)
    expect(out).toMatch(/\d{2} de agosto de 2026/);
  });

  it("o nome em falta diz «Assinado / Signed»", () => {
    const corpo = comporCorpoDoContrato(TEMPLATE, "pt+en");
    const out = injectSignaturesIntoBlock(corpo, { signed: true, showOtpBadge: false }, POR_ASSINAR, "pt", ["pt", "en"]);
    expect(out).toContain(">Assinado / Signed<");
  });

  it("a lista de idiomas do carimbo vem sempre pela ordem do registo, seja qual for a ordem pedida", () => {
    const out = injectSignaturesIntoBlock(BLOCO_EN, EMPRESA, CLIENTE, "en", ["en", "pt"]);
    expect(out).toContain("Assinado via SMS OTP / Signed via SMS OTP");
  });
});

describe("hasSignatoryHook — marcas e idiomas", () => {
  it("reconhece as marcas por classe", () => {
    expect(hasSignatoryHook(BLOCO_MARCADO)).toBe(true);
    expect(hasSignatoryHook(`<div class="olv-assinatura-empresa"></div>`)).toBe(true);
    expect(hasSignatoryHook(`<div class="outra olv-assinaturas"></div>`)).toBe(true);
  });

  it("reconhece o cliente em inglês só quando o idioma o pede; o português de hoje não muda", () => {
    expect(hasSignatoryHook("<p>THE CLIENT</p>")).toBe(false);
    expect(hasSignatoryHook("<p>the client signs</p>")).toBe(false);
    expect(hasSignatoryHook("<p>THE CLIENT</p>", "pt")).toBe(false);
    expect(hasSignatoryHook("<p>THE CLIENT</p>", "en")).toBe(true);
    expect(hasSignatoryHook("<p>THE CLIENT</p>", "pt", ["pt", "en"])).toBe(true);
    expect(hasSignatoryHook("<p>O CLIENTE</p>", "en")).toBe(true);
    expect(hasSignatoryHook("<p>O CLIENTE</p>")).toBe(true);
  });

  it("não confunde com uma classe parecida nem com texto sem a frase", () => {
    expect(hasSignatoryHook(`<div class="olv-assinaturas-extra"></div>`)).toBe(false);
    expect(hasSignatoryHook("<p>Cláusula sobre clientes</p>", "en")).toBe(false);
    expect(hasSignatoryHook("", "en")).toBe(false);
  });
});

describe("injectSignatoryIntoSignatureBlock — idioma e marcas", () => {
  it("refaz o bloco plano em inglês com o nome do signatário e as etiquetas em inglês", () => {
    const out = injectSignatoryIntoSignatureBlock(PLANO_EN, "Ricardo Belchior", "Manager", "en");
    expect(out).toContain("Ricardo Belchior");
    expect(out).toContain("Manager");
    expect(out).toContain("THE FIRST PARTY");
    expect(out).toContain("THE SECOND PARTY");
    expect(out).not.toContain("PRIMEIRA");
    expect(out).not.toContain("____");
  });

  it("sem dizer o idioma, o bloco plano em inglês não é tocado (só o português de hoje)", () => {
    expect(injectSignatoryIntoSignatureBlock(PLANO_EN, "Ricardo Belchior", "Manager")).toBe(PLANO_EN);
  });

  it("numa coluna da empresa marcada, o nome entra por baixo da linha, sem mexer no resto", () => {
    const out = injectSignatoryIntoSignatureBlock(BLOCO_MARCADO, "Ricardo Belchior", "Gerente");
    expect(out).toContain("Pela empresa");
    expect(out).toContain("Pelo cliente");
    expect(out.indexOf("Ricardo Belchior")).toBeGreaterThan(out.indexOf("border-bottom"));
    expect(out.indexOf("Ricardo Belchior")).toBeLessThan(out.indexOf("Pela empresa"));
    expect(out.indexOf("Gerente")).toBeGreaterThan(out.indexOf("Ricardo Belchior"));
    // aplicar duas vezes não duplica o nome
    const duas = injectSignatoryIntoSignatureBlock(out, "Ricardo Belchior", "Gerente");
    expect(duas.match(/Ricardo Belchior/g)).toHaveLength(1);
  });

  it("sem nome, devolve o html tal e qual", () => {
    expect(injectSignatoryIntoSignatureBlock(BLOCO_MARCADO, " ", "x")).toBe(BLOCO_MARCADO);
  });
});

// ── H1/H2/M3 na injeção ──────────────────────────────────────────────────────────────────────────
const CLAUSULA_EN = `<p>The Company shall provide the Services to the Client.</p>`;
const CORPO_EN = `<h2>SERVICES AGREEMENT</h2>${CLAUSULA_EN}${"<p>Clause.</p>".repeat(5)}`;

describe("cláusulas em inglês não são blocos de assinatura (H1) nem os do português (H2)", () => {
  it("em inglês, a cláusula curta no meio do corpo não é sobrescrita pela injeção", () => {
    expect(injectSignaturesIntoBlock(CORPO_EN, EMPRESA, CLIENTE, "en")).toBe(CORPO_EN);
    expect(injectSignaturesIntoBlock(CORPO_EN, EMPRESA, CLIENTE, "en", ["pt", "en"])).toBe(CORPO_EN);
    expect(injectSignatoryIntoSignatureBlock(CORPO_EN, "Ricardo", "Gerente", "en")).toBe(CORPO_EN);
  });

  it("o bloco real em inglês (colunas e plano no fim) continua a ser carimbado", () => {
    expect(injectSignaturesIntoBlock(`<p>Clause</p>${BLOCO_EN}`, EMPRESA, CLIENTE, "en")).toContain("Signed via SMS OTP");
    expect(injectSignaturesIntoBlock(PLANO_EN, EMPRESA, CLIENTE, "en")).toContain("Signed via SMS OTP");
  });

  it("um contrato em português com texto inglês solto não é tocado, com ou sem idioma", () => {
    const pt = `<p>Lisboa</p><p>The Client signs here</p><p>THE COMPANY and THE CLIENT agree.</p>`;
    expect(injectSignaturesIntoBlock(pt, EMPRESA, CLIENTE)).toBe(pt);
    expect(injectSignaturesIntoBlock(pt, EMPRESA, CLIENTE, "pt")).toBe(pt);
    const rotulos = `<p>THE FIRST PARTY and THE SECOND PARTY</p>`;
    expect(injectSignatoryIntoSignatureBlock(rotulos, "Ricardo", "Gerente")).toBe(rotulos);
    expect(hasSignatoryHook(pt)).toBe(false);
  });
});

describe("marcas por classe tratadas por igual (M3)", () => {
  const CONTENTOR = `<div class="olv-assinaturas"><div>${LINHA}<p>Pela empresa</p></div><div>${LINHA}<p>Pelo cliente</p></div></div>`;

  it("só o contentor marcado: as duas colunas levam carimbo", () => {
    const out = injectSignaturesIntoBlock(CONTENTOR, EMPRESA, CLIENTE);
    expect(out.indexOf("Ricardo Belchior")).toBeLessThan(out.indexOf("Pela empresa"));
    expect(out.indexOf("Assinado via SMS OTP")).toBeLessThan(out.indexOf("Pelo cliente"));
    expect(out.indexOf("Assinado via SMS OTP")).toBeGreaterThan(out.indexOf("Pela empresa"));
  });

  it("só a coluna do cliente marcada: a irmã é a da empresa e também leva carimbo", () => {
    const so = `<div style="display:flex"><div>${LINHA}<p>Pela empresa</p></div><div class="olv-assinatura-cliente">${LINHA}<p>Pelo cliente</p></div></div>`;
    const out = injectSignaturesIntoBlock(so, EMPRESA, CLIENTE);
    expect(out).toContain("Brush Script");
    expect(out).toContain("Assinado via SMS OTP");
  });
});

describe("a rúbrica antes do bloco não é apagada pelo signatário (M1)", () => {
  it("injectSignatoryIntoSignatureBlock só apaga linhas puramente decorativas", () => {
    const html = `<p>Lisboa</p><p><img src="rubrica.png"></p><p>_______</p><p>A PRIMEIRA CONTRATANTE   O SEGUNDO CONTRATANTE</p>`;
    const out = injectSignatoryIntoSignatureBlock(html, "Ricardo", "Gerente");
    expect(out).toContain("rubrica.png");
    expect(out).not.toContain("_______");
    expect(out).toContain("Ricardo");
  });
});
