import { describe, expect, it } from "vitest";
import { caminhoDaFicha } from "./urlFicha";

describe("caminhoDaFicha", () => {
  it("abre a ficha de uma pessoa a partir da lista", () => {
    expect(caminhoDaFicha("/rh-exemplo/pessoas", "p-rui")).toBe("/rh-exemplo/pessoas/p-rui");
    expect(caminhoDaFicha("/rh-exemplo/pessoas/", "p-rui")).toBe("/rh-exemplo/pessoas/p-rui");
  });
  it("passa de uma pessoa a outra sem acumular segmentos", () => {
    expect(caminhoDaFicha("/rh-exemplo/pessoas/p-rui", "p-ana")).toBe("/rh-exemplo/pessoas/p-ana");
  });
  it("fecha: volta ao caminho da lista", () => {
    expect(caminhoDaFicha("/rh-exemplo/pessoas/p-rui", null)).toBe("/rh-exemplo/pessoas");
    expect(caminhoDaFicha("/rh-exemplo/pessoas", null)).toBe("/rh-exemplo/pessoas");
  });
  it("escapa o id e respeita um prefixo", () => {
    expect(caminhoDaFicha("/app/rh-exemplo/pessoas", "a b")).toBe("/app/rh-exemplo/pessoas/a%20b");
  });
  it("deixa em paz um caminho que não é o da lista", () => {
    expect(caminhoDaFicha("/", "p-rui")).toBe("/");
    expect(caminhoDaFicha("/rh-exemplo/organograma", null)).toBe("/rh-exemplo/organograma");
  });
});
