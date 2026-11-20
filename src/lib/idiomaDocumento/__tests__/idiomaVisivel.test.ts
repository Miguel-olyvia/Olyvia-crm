import { describe, expect, it } from "vitest";
import { idiomaVisivelDoDocumento } from "../idiomaVisivel";

describe("idiomaVisivelDoDocumento (qual versão se mostra de cada vez)", () => {
  it("o cliente ainda não escolheu: o idioma da interface, se o documento o tem", () => {
    expect(idiomaVisivelDoDocumento({ disponiveis: ["pt", "en"], idiomaDaInterface: "en" })).toBe("en");
    expect(idiomaVisivelDoDocumento({ disponiveis: ["pt", "en"], idiomaDaInterface: "pt" })).toBe("pt");
  });

  it("o cliente ainda não escolheu e o documento não tem o idioma da interface: o primeiro do documento", () => {
    expect(idiomaVisivelDoDocumento({ disponiveis: ["pt", "es"], idiomaDaInterface: "en" })).toBe("pt");
    expect(idiomaVisivelDoDocumento({ disponiveis: ["en", "es"], idiomaDaInterface: "pt" })).toBe("en");
  });

  it("a escolha do cliente manda sobre a interface", () => {
    expect(idiomaVisivelDoDocumento({ disponiveis: ["pt", "en"], escolhido: "pt", idiomaDaInterface: "en" })).toBe("pt");
    expect(idiomaVisivelDoDocumento({ disponiveis: ["pt", "en"], escolhido: "en", idiomaDaInterface: "pt" })).toBe("en");
  });

  it("uma escolha que o documento não tem é ignorada (cai na interface, depois no primeiro)", () => {
    expect(idiomaVisivelDoDocumento({ disponiveis: ["pt", "en"], escolhido: "es", idiomaDaInterface: "en" })).toBe("en");
    expect(idiomaVisivelDoDocumento({ disponiveis: ["pt", "en"], escolhido: "es", idiomaDaInterface: "fr" })).toBe("pt");
  });

  it("aceita códigos em maiúsculas e ignora inválidos e repetidos", () => {
    expect(idiomaVisivelDoDocumento({ disponiveis: ["PT", "xx", "EN", "en"], escolhido: "EN", idiomaDaInterface: "pt" })).toBe("en");
  });

  it("sem idiomas devolve o idioma base (nunca vazio)", () => {
    expect(idiomaVisivelDoDocumento({ disponiveis: [], idiomaDaInterface: "en" })).toBe("pt");
  });
});
