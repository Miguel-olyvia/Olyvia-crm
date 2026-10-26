// O rascunho do assistente nunca partilha objetos entre leituras (um passo que o mude não estraga o vazio das outras), o id das linhas de medidas
// existe também fora de um contexto seguro (sem crypto.randomUUID), migra-se da chave da pessoa para a do negócio e apaga-se depois de gravar.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RASCUNHO_VAZIO, apagarRascunho, guardarRascunho, lerRascunho, migrarRascunho, novoIdLocal, rascunhoVazio,
} from "./rascunhoAssistente";

beforeEach(() => window.sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("rascunhoVazio e lerRascunho devolvem cópias", () => {
  it("cada leitura do vazio é um objeto novo, e mexer num não toca no outro nem no RASCUNHO_VAZIO", () => {
    const a = lerRascunho("a");
    const b = lerRascunho("b");
    expect(a).not.toBe(b);
    expect(a.preparar).not.toBe(b.preparar);
    expect(a.linhas).not.toBe(b.linhas);
    a.preparar.nota = "estragado";
    a.respostas.x = "y";
    a.linhas.push({ id: "l", divisao: "", trabalho: "", trabalhoOutro: "", medida: "", unidade: "m2", observacoes: "" });
    expect(lerRascunho("c").preparar.nota).toBe("");
    expect(lerRascunho("c").respostas).toEqual({});
    expect(RASCUNHO_VAZIO.preparar.nota).toBe("");
    expect(RASCUNHO_VAZIO.linhas).toEqual([]);
  });

  it("um valor estragado também devolve uma cópia nova", () => {
    window.sessionStorage.setItem("olyvia.assistente:k", "{nao json");
    expect(lerRascunho("k")).not.toBe(lerRascunho("k"));
  });

  it("rascunhoVazio dá sempre um objeto novo e igual ao vazio", () => {
    expect(rascunhoVazio()).toEqual(RASCUNHO_VAZIO);
    expect(rascunhoVazio()).not.toBe(rascunhoVazio());
  });
});

describe("novoIdLocal", () => {
  it("usa crypto.randomUUID quando existe", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "uuid-fixo" });
    expect(novoIdLocal()).toBe("uuid-fixo");
  });

  it("fora de um contexto seguro (sem randomUUID) dá ids não vazios e diferentes", () => {
    vi.stubGlobal("crypto", {});
    const ids = new Set(Array.from({ length: 50 }, () => novoIdLocal()));
    expect(ids.size).toBe(50);
    expect([...ids].every((i) => i.length > 0)).toBe(true);
  });

  it("sem crypto nenhum também não rebenta", () => {
    vi.stubGlobal("crypto", undefined);
    expect(novoIdLocal()).not.toBe("");
  });
});

describe("migrarRascunho: da chave da pessoa para a do negócio", () => {
  it("leva o escrito para a chave nova e apaga a antiga", () => {
    guardarRascunho("pessoa-1", { ...RASCUNHO_VAZIO, preparar: { duracao: "h1", quem: "casal", nota: "x" } });
    migrarRascunho("pessoa-1", "n9");
    expect(lerRascunho("n9").preparar).toEqual({ duracao: "h1", quem: "casal", nota: "x" });
    expect(window.sessionStorage.getItem("olyvia.assistente:pessoa-1")).toBeNull();
  });

  it("não pisa um rascunho que o negócio já tinha", () => {
    guardarRascunho("pessoa-1", { ...RASCUNHO_VAZIO, preparar: { duracao: "h1", quem: "", nota: "" } });
    guardarRascunho("n9", { ...RASCUNHO_VAZIO, preparar: { duracao: "h2", quem: "", nota: "" } });
    migrarRascunho("pessoa-1", "n9");
    expect(lerRascunho("n9").preparar.duracao).toBe("h2");
  });

  it("sem nada na chave antiga não cria nada, e chaves iguais não fazem nada", () => {
    migrarRascunho("pessoa-1", "n9");
    expect(window.sessionStorage.getItem("olyvia.assistente:n9")).toBeNull();
    guardarRascunho("n9", { ...RASCUNHO_VAZIO, observacoes: "ok" });
    migrarRascunho("n9", "n9");
    expect(lerRascunho("n9").observacoes).toBe("ok");
  });

  it("apagarRascunho tira o que estava guardado", () => {
    guardarRascunho("n9", { ...RASCUNHO_VAZIO, observacoes: "ok" });
    apagarRascunho("n9");
    expect(lerRascunho("n9").observacoes).toBe("");
  });
});
