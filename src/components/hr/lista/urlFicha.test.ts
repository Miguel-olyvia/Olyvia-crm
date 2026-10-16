import { describe, expect, it } from "vitest";
import { caminhoDaFicha } from "./urlFicha";

describe("caminhoDaFicha", () => {
  it("abre a ficha de uma pessoa a partir da lista", () => {
    expect(caminhoDaFicha("/rh/pessoas", "p-rui")).toBe("/rh/pessoas/p-rui");
    expect(caminhoDaFicha("/rh/pessoas/", "p-rui")).toBe("/rh/pessoas/p-rui");
  });
  it("passa de uma pessoa a outra sem acumular segmentos", () => {
    expect(caminhoDaFicha("/rh/pessoas/p-rui", "p-ana")).toBe("/rh/pessoas/p-ana");
  });
  it("fecha: volta ao caminho da lista", () => {
    expect(caminhoDaFicha("/rh/pessoas/p-rui", null)).toBe("/rh/pessoas");
    expect(caminhoDaFicha("/rh/pessoas", null)).toBe("/rh/pessoas");
  });
  it("escapa o id e respeita um prefixo", () => {
    expect(caminhoDaFicha("/app/rh/pessoas", "a b")).toBe("/app/rh/pessoas/a%20b");
  });
  it("deixa em paz um caminho que não é o da lista", () => {
    expect(caminhoDaFicha("/", "p-rui")).toBe("/");
    expect(caminhoDaFicha("/rh/organograma", null)).toBe("/rh/organograma");
  });
});
