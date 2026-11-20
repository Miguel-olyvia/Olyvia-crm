import { describe, expect, it } from "vitest";
import { contratoUsaVersoes } from "../contractVersions";

const COM_MARCAS =
  `<div class="olv-versao olv-versao-pt"><p>um</p></div>` +
  `<div class="olv-versao olv-versao-en" style="break-before:page;page-break-before:always"><p>one</p></div>`;

describe("contratoUsaVersoes: quem passa pelo resolver por versões", () => {
  it("contrato de sempre (sem marcas, sem __idiomas): não", () => {
    expect(contratoUsaVersoes("<p>Corpo</p>", { id: "c1", prompt_values: null })).toBe(false);
    expect(contratoUsaVersoes("<p>Corpo</p>", { id: "c1", prompt_values: { cliente_nif: "123" } })).toBe(false);
    expect(contratoUsaVersoes("<p>Corpo</p>", null)).toBe(false);
    expect(contratoUsaVersoes("", undefined)).toBe(false);
  });

  it("__idiomas só português: não", () => {
    expect(contratoUsaVersoes("<p>Corpo</p>", { prompt_values: { __idiomas: "pt" } })).toBe(false);
  });

  it("corpo com marcas olv-versao: sim, qualquer que seja o __idiomas", () => {
    expect(contratoUsaVersoes(COM_MARCAS, {})).toBe(true);
    expect(contratoUsaVersoes(COM_MARCAS, { prompt_values: { __idiomas: "pt" } })).toBe(true);
  });

  it("um só idioma que não é português, sem marcas: sim", () => {
    expect(contratoUsaVersoes("<p>Body</p>", { prompt_values: { __idiomas: "en" } })).toBe(true);
  });

  it("__idiomas com mais de um idioma, sem marcas: sim", () => {
    expect(contratoUsaVersoes("<p>Corpo</p>", { prompt_values: { __idiomas: "pt+en" } })).toBe(true);
  });

  it("a coluna language, quando existir, manda sobre __idiomas (a leitura é uma só)", () => {
    expect(contratoUsaVersoes("<p>Body</p>", { language: "en", prompt_values: { __idiomas: "pt" } })).toBe(true);
  });
});
