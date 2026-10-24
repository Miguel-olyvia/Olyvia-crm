import { describe, expect, it } from "vitest";
import { criarEspera } from "./esperaDeDialogo";

describe("esperaDeDialogo: o que abre depois de um diálogo desmontar", () => {
  it("sem nada à espera, fechar qualquer diálogo não devolve nada", () => {
    const espera = criarEspera<string, string>();
    expect(espera.consumir("verificar")).toBeNull();
  });

  it("só o diálogo de origem consome o que está à espera, e uma só vez", () => {
    const espera = criarEspera<string, string>();
    espera.guardar("verificar", "editor");
    expect(espera.consumir("verificar")).toBe("editor");
    expect(espera.consumir("verificar")).toBeNull();
  });

  it("fechar OUTRO diálogo não abre o editor nem gasta o que está à espera", () => {
    const espera = criarEspera<string, string>();
    espera.guardar("verificar", "editor");
    expect(espera.consumir("direcao")).toBeNull();
    expect(espera.consumir("proposta")).toBeNull();
    expect(espera.consumir("verificar")).toBe("editor");
  });

  it("guardar outra vez substitui o que estava à espera", () => {
    const espera = criarEspera<string, string>();
    espera.guardar("verificar", "um");
    espera.guardar("direcao", "dois");
    expect(espera.consumir("verificar")).toBeNull();
    expect(espera.consumir("direcao")).toBe("dois");
  });
});
