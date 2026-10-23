import { beforeEach, describe, expect, it } from "vitest";
import {
  CHAVE_PREFS_PESSOAS, PREFS_PESSOAS_INICIAIS, guardarPrefsPessoas, lerPrefsPessoas,
} from "./preferenciasPessoas";

beforeEach(() => window.localStorage.clear());

describe("preferências guardadas", () => {
  it("o defeito é Todos, Todas, Urgência e Lista", () => {
    expect(PREFS_PESSOAS_INICIAIS).toEqual({ tipo: "todos", chip: "todas", ordem: "urgencia", vista: "lista" });
    expect(lerPrefsPessoas()).toEqual(PREFS_PESSOAS_INICIAIS);
  });

  it("guardam e leem o tipo, o chip, a ordem e a vista", () => {
    guardarPrefsPessoas({ tipo: "leads", chip: "atrasadas", ordem: "valor", vista: "quadro" });
    expect(lerPrefsPessoas()).toEqual({ tipo: "leads", chip: "atrasadas", ordem: "valor", vista: "quadro" });
  });

  it("lixo no armazenamento volta aos valores por defeito", () => {
    window.localStorage.setItem(CHAVE_PREFS_PESSOAS, "{não é json");
    expect(lerPrefsPessoas()).toEqual(PREFS_PESSOAS_INICIAIS);
    window.localStorage.setItem(CHAVE_PREFS_PESSOAS, JSON.stringify({ ordem: "x", chip: 3, tipo: null, vista: 7 }));
    expect(lerPrefsPessoas()).toEqual(PREFS_PESSOAS_INICIAIS);
  });

  it("valores de versões antigas (ordem atencao, chip voltou) caem no defeito, valor a valor", () => {
    window.localStorage.setItem(CHAVE_PREFS_PESSOAS, JSON.stringify({ ordem: "atencao", chip: "voltou", tipo: "clientes" }));
    expect(lerPrefsPessoas()).toEqual({ tipo: "clientes", chip: "todas", ordem: "urgencia", vista: "lista" });
    window.localStorage.setItem(CHAVE_PREFS_PESSOAS, JSON.stringify({ ordem: "nome", chip: "semNegocio" }));
    expect(lerPrefsPessoas()).toEqual(PREFS_PESSOAS_INICIAIS);
  });

  it("um chip que o tipo não tem (Perdidas em Clientes) volta a Todas", () => {
    window.localStorage.setItem(CHAVE_PREFS_PESSOAS, JSON.stringify({ tipo: "clientes", chip: "perdidas", ordem: "recentes" }));
    expect(lerPrefsPessoas()).toEqual({ tipo: "clientes", chip: "todas", ordem: "recentes", vista: "lista" });
  });
});
