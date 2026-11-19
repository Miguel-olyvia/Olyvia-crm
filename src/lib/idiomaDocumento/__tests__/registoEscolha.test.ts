import { describe, expect, it } from "vitest";
import {
  IDIOMAS,
  IDIOMA_BASE,
  idiomaRegistado,
  localeDoIdioma,
  nomeDoIdioma,
  normalizarCodigo,
  ordenarPorRegisto,
} from "../registo";
import { idiomasDoDocumento, parseEscolha, serializarEscolha } from "../escolha";

describe("registo de idiomas", () => {
  it("o português é a base e vem primeiro; o inglês está registado", () => {
    expect(IDIOMA_BASE).toBe("pt");
    expect(IDIOMAS[0].codigo).toBe("pt");
    expect(IDIOMAS.map((i) => i.codigo)).toEqual(expect.arrayContaining(["pt", "en"]));
  });

  it("cada idioma tem código de 2 letras minúsculas, nome, nome nativo e locale", () => {
    for (const i of IDIOMAS) {
      expect(i.codigo).toMatch(/^[a-z]{2}$/);
      expect(i.nome.trim()).not.toBe("");
      expect(i.nomeNativo.trim()).not.toBe("");
      expect(i.locale.trim()).not.toBe("");
    }
    expect(new Set(IDIOMAS.map((i) => i.codigo)).size).toBe(IDIOMAS.length);
  });

  it("os códigos são abertos: há mais do que pt e en", () => {
    expect(IDIOMAS.length).toBeGreaterThan(2);
    expect(idiomaRegistado("es")).toBe(true);
    expect(idiomaRegistado("fr")).toBe(true);
  });

  it("idiomaRegistado / normalizarCodigo", () => {
    expect(idiomaRegistado("pt")).toBe(true);
    expect(idiomaRegistado("xx")).toBe(false);
    expect(idiomaRegistado(null)).toBe(false);
    expect(idiomaRegistado(undefined)).toBe(false);
    expect(idiomaRegistado(7)).toBe(false);
    expect(normalizarCodigo("  EN ")).toBe("en");
    expect(normalizarCodigo("xx")).toBeNull();
    expect(normalizarCodigo("")).toBeNull();
    expect(normalizarCodigo({})).toBeNull();
  });

  it("nome e locale por código, com omissão no português", () => {
    expect(nomeDoIdioma("en")).toBe("English");
    expect(nomeDoIdioma("pt")).toBe("Português");
    expect(nomeDoIdioma("xx")).toBe("xx");
    expect(localeDoIdioma("pt")).toBe("pt-PT");
    expect(localeDoIdioma("en")).toBe("en-GB");
    expect(localeDoIdioma("xx")).toBe("pt-PT");
  });

  it("ordenarPorRegisto põe o português primeiro e ignora repetidos e desconhecidos", () => {
    expect(ordenarPorRegisto(["en", "pt"])).toEqual(["pt", "en"]);
    expect(ordenarPorRegisto(["en", "en", "xx", "pt"])).toEqual(["pt", "en"]);
    expect(ordenarPorRegisto([])).toEqual([]);
  });
});

describe("parseEscolha", () => {
  it("lê um e dois idiomas, na ordem dada", () => {
    expect(parseEscolha("pt")).toEqual(["pt"]);
    expect(parseEscolha("en")).toEqual(["en"]);
    expect(parseEscolha("pt+en")).toEqual(["pt", "en"]);
    expect(parseEscolha("en+pt")).toEqual(["en", "pt"]);
  });

  it("aceita listas e três idiomas", () => {
    expect(parseEscolha(["pt", "en", "es"])).toEqual(["pt", "en", "es"]);
    expect(parseEscolha("pt+en+es")).toEqual(["pt", "en", "es"]);
  });

  it("tira repetidos, espaços e maiúsculas", () => {
    expect(parseEscolha("pt+pt+en")).toEqual(["pt", "en"]);
    expect(parseEscolha(" PT + En ")).toEqual(["pt", "en"]);
  });

  it("ignora códigos inválidos", () => {
    expect(parseEscolha("pt+xx+en")).toEqual(["pt", "en"]);
    expect(parseEscolha(["en", 5, null, "zz"])).toEqual(["en"]);
  });

  it("nunca devolve vazio: cai no português", () => {
    expect(parseEscolha("")).toEqual(["pt"]);
    expect(parseEscolha(null)).toEqual(["pt"]);
    expect(parseEscolha(undefined)).toEqual(["pt"]);
    expect(parseEscolha("xx")).toEqual(["pt"]);
    expect(parseEscolha([])).toEqual(["pt"]);
    expect(parseEscolha(42)).toEqual(["pt"]);
    expect(parseEscolha({ a: 1 })).toEqual(["pt"]);
  });
});

describe("serializarEscolha", () => {
  it("junta com + e preserva a ordem", () => {
    expect(serializarEscolha(["pt"])).toBe("pt");
    expect(serializarEscolha(["en"])).toBe("en");
    expect(serializarEscolha(["pt", "en"])).toBe("pt+en");
    expect(serializarEscolha(["en", "pt"])).toBe("en+pt");
  });

  it("sem repetidos, sem inválidos e nunca vazio", () => {
    expect(serializarEscolha(["pt", "pt", "en"])).toBe("pt+en");
    expect(serializarEscolha(["xx", "en"])).toBe("en");
    expect(serializarEscolha([])).toBe("pt");
    expect(serializarEscolha(["xx"])).toBe("pt");
  });

  it("serializar e ler dão o mesmo", () => {
    for (const e of [["pt"], ["en"], ["pt", "en"], ["pt", "en", "es"]]) {
      expect(parseEscolha(serializarEscolha(e))).toEqual(e);
    }
  });
});

describe("idiomasDoDocumento", () => {
  it("lê language primeiro", () => {
    expect(idiomasDoDocumento({ language: "en", prompt_values: { __idiomas: "pt" } })).toEqual(["en"]);
    expect(idiomasDoDocumento({ language: "pt+en" })).toEqual(["pt", "en"]);
  });

  it("senão lê prompt_values.__idiomas", () => {
    expect(idiomasDoDocumento({ prompt_values: { __idiomas: "pt+en" } })).toEqual(["pt", "en"]);
    expect(idiomasDoDocumento({ language: null, prompt_values: { __idiomas: "en" } })).toEqual(["en"]);
  });

  it("senão português", () => {
    expect(idiomasDoDocumento({})).toEqual(["pt"]);
    expect(idiomasDoDocumento(null)).toEqual(["pt"]);
    expect(idiomasDoDocumento(undefined)).toEqual(["pt"]);
    expect(idiomasDoDocumento({ prompt_values: null })).toEqual(["pt"]);
    expect(idiomasDoDocumento({ prompt_values: { outro: "x" } })).toEqual(["pt"]);
    expect(idiomasDoDocumento({ prompt_values: { __idiomas: "xx" } })).toEqual(["pt"]);
  });
});
