import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { criarNegocioNovo, negociosNovos, repor, useNegociosNovos } from "./negociosNovos";
import { HOJE_EXEMPLO } from "./negocioMetasExemplo";

const dados = { pessoa: { id: "p-rui", nome: "Rui Figueiredo" }, comercial: "Ana Ribeiro" };

afterEach(() => repor());

describe("negociosNovos", () => {
  it("começa vazio e a mesma lista enquanto não se cria nada", () => {
    expect(negociosNovos()).toEqual([]);
    expect(negociosNovos()).toBe(negociosNovos());
  });

  it("cria com ids em sequência, na ordem, sem mexer na lista anterior", () => {
    const antes = negociosNovos();
    const a = criarNegocioNovo(dados, HOJE_EXEMPLO);
    const b = criarNegocioNovo(dados, HOJE_EXEMPLO);
    expect([a.id, b.id]).toEqual(["n-novo-1", "n-novo-2"]);
    expect(negociosNovos().map((n) => n.id)).toEqual(["n-novo-1", "n-novo-2"]);
    expect(antes).toEqual([]);
  });

  it("repor() esquece tudo e recomeça a numeração", () => {
    criarNegocioNovo(dados, HOJE_EXEMPLO);
    repor();
    expect(negociosNovos()).toEqual([]);
    expect(criarNegocioNovo(dados, HOJE_EXEMPLO).id).toBe("n-novo-1");
  });

  it("avisa quem está à escuta, e deixa de avisar depois de sair", () => {
    const { result, unmount } = renderHook(() => useNegociosNovos());
    expect(result.current).toHaveLength(0);
    act(() => { criarNegocioNovo(dados, HOJE_EXEMPLO); });
    expect(result.current).toHaveLength(1);
    act(() => repor());
    expect(result.current).toHaveLength(0);
    unmount();
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => { criarNegocioNovo(dados, HOJE_EXEMPLO); });
    expect(erro).not.toHaveBeenCalled();
  });
});
