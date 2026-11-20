import { describe, expect, it } from "vitest";
import { resolverIdiomasDaProposta } from "../idiomasDaProposta";

const comEn = { design_settings: { versions: { en: { terms_conditions: "Terms" } } } };
const comEnEEs = { design_settings: { versions: { en: { terms_conditions: "Terms" }, es: { terms_conditions: "T" } } } };

describe("resolverIdiomasDaProposta", () => {
  it("sem nada: português", () => {
    expect(resolverIdiomasDaProposta({})).toEqual(["pt"]);
    expect(resolverIdiomasDaProposta({ template: null, linha: null, idiomaDoPortal: null })).toEqual(["pt"]);
  });

  it("template sem versões: ignora o idioma do portal e a escolha (só há o português)", () => {
    expect(resolverIdiomasDaProposta({ template: { sections: [] }, idiomaDoPortal: "en" })).toEqual(["pt"]);
    expect(resolverIdiomasDaProposta({ template: { sections: [] }, escolha: ["pt", "en"] })).toEqual(["pt"]);
  });

  it("sem escolha: o idioma do botão do portal, se o template tem essa versão", () => {
    expect(resolverIdiomasDaProposta({ template: comEn, idiomaDoPortal: "en" })).toEqual(["en"]);
    expect(resolverIdiomasDaProposta({ template: comEn, idiomaDoPortal: "pt" })).toEqual(["pt"]);
  });

  it("sem escolha e sem a versão do portal: português", () => {
    expect(resolverIdiomasDaProposta({ template: comEn, idiomaDoPortal: "fr" })).toEqual(["pt"]);
    expect(resolverIdiomasDaProposta({ template: comEn, idiomaDoPortal: "lixo" })).toEqual(["pt"]);
    expect(resolverIdiomasDaProposta({ template: comEn })).toEqual(["pt"]);
  });

  it("a escolha por parâmetro manda sobre o portal, por ordem e só com idiomas que o template tem", () => {
    expect(resolverIdiomasDaProposta({ template: comEn, escolha: ["pt", "en"], idiomaDoPortal: "pt" })).toEqual(["pt", "en"]);
    expect(resolverIdiomasDaProposta({ template: comEn, escolha: "pt+en" })).toEqual(["pt", "en"]);
    expect(resolverIdiomasDaProposta({ template: comEn, escolha: ["en"], idiomaDoPortal: "pt" })).toEqual(["en"]);
    expect(resolverIdiomasDaProposta({ template: comEnEEs, escolha: ["en", "fr", "pt", "en"] })).toEqual(["en", "pt"]);
  });

  it("escolha sem nenhum idioma disponível cai no idioma base", () => {
    expect(resolverIdiomasDaProposta({ template: comEn, escolha: ["fr"] })).toEqual(["pt"]);
    expect(resolverIdiomasDaProposta({ template: comEn, escolha: [] })).toEqual(["pt"]);
  });

  it("escolha vazia ou nula não conta como escolha: vale o portal", () => {
    expect(resolverIdiomasDaProposta({ template: comEn, escolha: null, idiomaDoPortal: "en" })).toEqual(["en"]);
    expect(resolverIdiomasDaProposta({ template: comEn, escolha: [], idiomaDoPortal: "en" })).toEqual(["en"]);
  });

  it("a proposta já criada com uma escolha própria (prompt_values.__idiomas) vale mais do que o portal", () => {
    const linha = { prompt_values: { __idiomas: "pt+en" } };
    expect(resolverIdiomasDaProposta({ template: comEn, linha, idiomaDoPortal: "pt" })).toEqual(["pt", "en"]);
  });

  it("a coluna language da proposta, quando existir, passa pela mesma leitura (idiomasDoDocumento)", () => {
    expect(resolverIdiomasDaProposta({ template: comEn, linha: { language: "en" }, idiomaDoPortal: "pt" })).toEqual(["en"]);
  });

  it("uma linha só em português não impede o portal de escolher o inglês", () => {
    expect(resolverIdiomasDaProposta({ template: comEn, linha: { language: "pt" }, idiomaDoPortal: "en" })).toEqual(["en"]);
    expect(resolverIdiomasDaProposta({ template: comEn, linha: {}, idiomaDoPortal: "en" })).toEqual(["en"]);
  });

  it("o que a linha pede mas o template não tem é descartado", () => {
    expect(resolverIdiomasDaProposta({ template: { sections: [] }, linha: { language: "en" }, idiomaDoPortal: "pt" })).toEqual(["pt"]);
  });

  it("template com outro idioma base: a base é a que o template diz", () => {
    const tpl = { language: "en", design_settings: { versions: { pt: { terms_conditions: "T" } } } };
    expect(resolverIdiomasDaProposta({ template: tpl })).toEqual(["en"]);
    expect(resolverIdiomasDaProposta({ template: tpl, idiomaDoPortal: "pt" })).toEqual(["pt"]);
  });
});
