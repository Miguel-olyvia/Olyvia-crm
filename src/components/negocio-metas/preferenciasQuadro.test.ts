import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHAVE_PREFERENCIAS, PREFERENCIAS_INICIAIS, guardarPreferencias, lerPreferencias,
} from "./preferenciasQuadro";

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("preferências do Quadro", () => {
  it("sem nada guardado, Os meus começa ligado e a ordem é a por defeito", () => {
    expect(lerPreferencias()).toEqual({ ordem: null, meus: true, fases: [] });
  });
  it("guarda e volta a ler", () => {
    const p = { ordem: { coluna: "valor" as const, dir: "desc" as const }, meus: false, fases: ["proposta" as const, "contrato" as const] };
    guardarPreferencias(p);
    expect(lerPreferencias()).toEqual(p);
  });
  it("lixo no armazenamento volta aos valores por defeito", () => {
    window.localStorage.setItem(CHAVE_PREFERENCIAS, "{isto não é json");
    expect(lerPreferencias()).toEqual(PREFERENCIAS_INICIAIS);
    window.localStorage.setItem(CHAVE_PREFERENCIAS, "42");
    expect(lerPreferencias()).toEqual(PREFERENCIAS_INICIAIS);
  });
  it("nomes herdados de objetos (constructor) não valem como coluna", () => {
    window.localStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify({ ordem: { coluna: "constructor", dir: "asc" } }));
    expect(lerPreferencias().ordem).toBeNull();
  });
  it("campos inválidos são repostos um a um", () => {
    window.localStorage.setItem(
      CHAVE_PREFERENCIAS,
      JSON.stringify({ ordem: { coluna: "inventada", dir: "asc" }, meus: "sim", fases: ["proposta", "xpto"] }),
    );
    expect(lerPreferencias()).toEqual({ ordem: null, meus: true, fases: ["proposta"] });
  });
  it("funciona quando o armazenamento falha", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    expect(lerPreferencias()).toEqual(PREFERENCIAS_INICIAIS);
    expect(() => guardarPreferencias(PREFERENCIAS_INICIAIS)).not.toThrow();
  });
});
