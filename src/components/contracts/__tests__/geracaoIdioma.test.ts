import { describe, expect, it } from "vitest";
import { comporCorpoDoContrato } from "@/lib/idiomaDocumento";
import { prepararGeracaoDoContrato } from "../geracaoIdioma";

const PT = "<h2>CONTRATO</h2><p>Cláusula 1 para {{cliente_nome}}.</p>";
const EN = "<h2>SERVICES AGREEMENT</h2><p>Clause 1 for {{cliente_nome}}.</p>";

const SEM_VERSOES = { body_html: PT, language: "pt", doc_settings: { primary_color: "#123456" } };
const COM_EN = { body_html: PT, language: "pt", doc_settings: { versions: { en: { body_html: EN } } } };

describe("prepararGeracaoDoContrato: português / sem versões = exatamente como hoje", () => {
  it("sem escolha: corpo igual byte a byte, sem __idiomas, promptValues não é tocado", () => {
    const prompts = { cliente_nif: "123" };
    const r = prepararGeracaoDoContrato(SEM_VERSOES, undefined, prompts);
    expect(r.corpoHtml).toBe(PT);
    expect(r.promptValues).toBe(prompts);
    expect(r.idiomaDaAssinatura).toBeUndefined();
    expect(r.idiomas).toEqual(["pt"]);
  });

  it("sem escolha e sem promptValues: promptValues continua indefinido (a RPC recebe null como hoje)", () => {
    expect(prepararGeracaoDoContrato(SEM_VERSOES, undefined, undefined).promptValues).toBeUndefined();
  });

  it("escolha só o idioma base: igual a sem escolha, mesmo num template COM versões", () => {
    const a = prepararGeracaoDoContrato(COM_EN, ["pt"], { k: "v" });
    expect(a.corpoHtml).toBe(PT);
    expect(a.promptValues).toEqual({ k: "v" });
    expect(Object.keys(a.promptValues ?? {})).not.toContain("__idiomas");
    expect(a.idiomaDaAssinatura).toBeUndefined();
  });

  it("escolha que o template não oferece (en sem versão inglesa) cai no base e não grava __idiomas", () => {
    const r = prepararGeracaoDoContrato(SEM_VERSOES, ["en"], undefined);
    expect(r.corpoHtml).toBe(PT);
    expect(r.promptValues).toBeUndefined();
    expect(r.idiomas).toEqual(["pt"]);
  });

  it("template nulo: corpo vazio e nada gravado", () => {
    const r = prepararGeracaoDoContrato(null, ["pt", "en"], undefined);
    expect(r.corpoHtml).toBe("");
    expect(r.promptValues).toBeUndefined();
  });
});

describe("prepararGeracaoDoContrato: com outros idiomas", () => {
  it("só inglês: corpo composto pelo núcleo, __idiomas = en, assinatura procurada em inglês", () => {
    const r = prepararGeracaoDoContrato(COM_EN, ["en"], undefined);
    expect(r.corpoHtml).toBe(comporCorpoDoContrato(COM_EN, ["en"]));
    expect(r.corpoHtml).toContain("olv-versao-en");
    expect(r.promptValues).toEqual({ __idiomas: "en" });
    expect(r.idiomaDaAssinatura).toBe("en");
  });

  it("os dois: pt primeiro, __idiomas = pt+en, junta-se aos valores já preenchidos sem os alterar", () => {
    const prompts = { cliente_nif: "123" };
    const r = prepararGeracaoDoContrato(COM_EN, ["en", "pt"], prompts);
    expect(r.corpoHtml).toBe(comporCorpoDoContrato(COM_EN, ["pt", "en"]));
    expect(r.corpoHtml.indexOf("olv-versao-pt")).toBeLessThan(r.corpoHtml.indexOf("olv-versao-en"));
    expect(r.promptValues).toEqual({ cliente_nif: "123", __idiomas: "pt+en" });
    expect(prompts).toEqual({ cliente_nif: "123" });
    expect(r.idiomaDaAssinatura).toBe("en");
  });

  it("valores vazios + idioma extra: só __idiomas", () => {
    expect(prepararGeracaoDoContrato(COM_EN, ["pt", "en"], {}).promptValues).toEqual({ __idiomas: "pt+en" });
  });
});
