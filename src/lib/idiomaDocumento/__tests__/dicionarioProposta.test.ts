import { describe, expect, it } from "vitest";
import { DICIONARIO_PROPOSTA_EN } from "../dicionario.proposta.en";
import { DICIONARIO_PROPOSTA_PT } from "../dicionario.proposta.pt";
import { DICIONARIO_EN } from "../dicionario.en";
import { DICIONARIO_PT } from "../dicionario.pt";
import { tDoc } from "../dicionario";

function marcadores(texto: string): string[] {
  return [...texto.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort();
}

describe("dicionário doc.proposta.* (rótulos do PDF da proposta) — paridade pt/en", () => {
  const chavesPt = Object.keys(DICIONARIO_PROPOSTA_PT).sort();

  it("têm exatamente as mesmas chaves", () => {
    expect(Object.keys(DICIONARIO_PROPOSTA_EN).sort()).toEqual(chavesPt);
    expect(chavesPt.length).toBeGreaterThan(40);
  });

  it("todas as chaves começam por doc.proposta.", () => {
    for (const k of chavesPt) expect(k.startsWith("doc.proposta."), k).toBe(true);
  });

  it("não colidem com as chaves do dicionário geral", () => {
    for (const k of chavesPt) {
      expect(k in DICIONARIO_PT, `pt ${k}`).toBe(false);
      expect(k in DICIONARIO_EN, `en ${k}`).toBe(false);
    }
  });

  it("nenhuma tradução está vazia e os marcadores {x} são os mesmos", () => {
    for (const k of chavesPt) {
      expect(DICIONARIO_PROPOSTA_PT[k].trim(), `pt ${k}`).not.toBe("");
      expect(DICIONARIO_PROPOSTA_EN[k].trim(), `en ${k}`).not.toBe("");
      expect(marcadores(DICIONARIO_PROPOSTA_EN[k]), k).toEqual(marcadores(DICIONARIO_PROPOSTA_PT[k]));
    }
  });

  it("o inglês não é cópia do português, salvo siglas e palavras iguais nas duas línguas", () => {
    const iguais = new Set(["doc.proposta.sku", "doc.proposta.email", "doc.proposta.tel", "doc.proposta.tabela.total", "doc.proposta.bundle"]);
    for (const k of chavesPt) {
      if (iguais.has(k)) continue;
      expect(DICIONARIO_PROPOSTA_EN[k], k).not.toBe(DICIONARIO_PROPOSTA_PT[k]);
    }
  });
});

describe("tDoc com as chaves doc.proposta.*", () => {
  it("pt: as palavras que o PDF escrevia sempre", () => {
    expect(tDoc("pt", "doc.proposta.titulo.proposta")).toBe("PROPOSTA");
    expect(tDoc("pt", "doc.proposta.detalhes.proposta")).toBe("DETALHES DA PROPOSTA");
    expect(tDoc("pt", "doc.proposta.valor.proposta")).toBe("VALOR DA PROPOSTA");
    expect(tDoc("pt", "doc.proposta.total.geral")).toBe("TOTAL GERAL (c/ IVA):");
    expect(tDoc("pt", "doc.proposta.validade.orcamento", { dias: 30 })).toBe("Este orçamento é válido por 30 dias a partir da data de emissão.");
  });

  it("en: palavras em inglês, com marcadores preenchidos", () => {
    expect(tDoc("en", "doc.proposta.titulo.proposta")).toBe("PROPOSAL");
    expect(tDoc("en", "doc.proposta.total.geral")).toBe("GRAND TOTAL (incl. VAT):");
    expect(tDoc("en", "doc.proposta.validade.orcamento", { dias: 30 })).toBe("This quote is valid for 30 days from the date of issue.");
  });

  it("um idioma sem dicionário próprio usa o português", () => {
    expect(tDoc("fr", "doc.proposta.titulo.proposta")).toBe("PROPOSTA");
  });
});
