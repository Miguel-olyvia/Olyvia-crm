import { beforeEach, describe, expect, it } from "vitest";
import {
  CHAVE_PREFS_PESSOAS, PREFS_PESSOAS_INICIAIS, chipEfetivo, guardarPrefsPessoas, lerPrefsPessoas,
} from "./preferenciasPessoas";

beforeEach(() => window.localStorage.clear());

describe("chipEfetivo", () => {
  it("sem permissão para ver submissões, o chip guardado Voltou a contactar vira Todos", () => {
    expect(chipEfetivo("voltou", false)).toBe("todos");
  });

  it("com permissão, ou noutro chip, não muda", () => {
    expect(chipEfetivo("voltou", true)).toBe("voltou");
    expect(chipEfetivo("leads", false)).toBe("leads");
  });
});

describe("preferências guardadas", () => {
  it("guardam e leem a ordem e o chip", () => {
    guardarPrefsPessoas({ ordem: "valor", chip: "clientes" });
    expect(lerPrefsPessoas()).toEqual({ ordem: "valor", chip: "clientes" });
  });

  it("lixo no armazenamento volta aos valores por defeito", () => {
    window.localStorage.setItem(CHAVE_PREFS_PESSOAS, "{não é json");
    expect(lerPrefsPessoas()).toEqual(PREFS_PESSOAS_INICIAIS);
    window.localStorage.setItem(CHAVE_PREFS_PESSOAS, JSON.stringify({ ordem: "x", chip: 3 }));
    expect(lerPrefsPessoas()).toEqual(PREFS_PESSOAS_INICIAIS);
  });
});
