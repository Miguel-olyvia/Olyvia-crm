import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { uid } = vi.hoisted(() => ({ uid: { valor: "u1" as string | null, falha: false } }));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({
  resolveCurrentBusinessUserId: vi.fn(async () => {
    if (uid.falha) throw new Error("sem sessão");
    return uid.valor;
  }),
}));

import { chavePreferencia, guardarPreferencia, lerPreferencia, useEscolhaDeIdiomas } from "../idiomaPreferido";

describe("preferência de idiomas por utilizador e minuta (localStorage)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    uid.valor = "u1";
    uid.falha = false;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("guarda e lê a escolha por utilizador e minuta", () => {
    guardarPreferencia("u1", "m1", ["pt", "en"]);
    expect(lerPreferencia("u1", "m1")).toEqual(["pt", "en"]);
    expect(lerPreferencia("u2", "m1")).toBeNull();
    expect(lerPreferencia("u1", "m2")).toBeNull();
    expect(window.localStorage.getItem(chavePreferencia("u1", "m1"))).toBe("pt+en");
  });

  it("valor corrompido ou código inválido: null (cai no idioma base)", () => {
    window.localStorage.setItem(chavePreferencia("u1", "m1"), "{lixo");
    expect(lerPreferencia("u1", "m1")).toBeNull();
    window.localStorage.setItem(chavePreferencia("u1", "m1"), "");
    expect(lerPreferencia("u1", "m1")).toBeNull();
  });

  it("localStorage indisponível: não rebenta, nem a ler nem a escrever", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("cheio"); });
    expect(lerPreferencia("u1", "m1")).toBeNull();
    expect(() => guardarPreferencia("u1", "m1", ["en"])).not.toThrow();
  });
});

describe("useEscolhaDeIdiomas", () => {
  beforeEach(() => {
    window.localStorage.clear();
    uid.valor = "u1";
    uid.falha = false;
  });

  it("sem preferência guardada: o idioma base", async () => {
    const { result } = renderHook(() => useEscolhaDeIdiomas("m1", ["pt", "en"], "pt"));
    await waitFor(() => expect(result.current.escolha).toEqual(["pt"]));
  });

  it("com preferência guardada: pré-seleciona o último usado por este utilizador e minuta", async () => {
    guardarPreferencia("u1", "m1", ["pt", "en"]);
    const { result } = renderHook(() => useEscolhaDeIdiomas("m1", ["pt", "en"], "pt"));
    await waitFor(() => expect(result.current.escolha).toEqual(["pt", "en"]));
  });

  it("a preferência de outro utilizador ou de outra minuta não conta", async () => {
    guardarPreferencia("u2", "m1", ["en"]);
    guardarPreferencia("u1", "m2", ["en"]);
    const { result } = renderHook(() => useEscolhaDeIdiomas("m1", ["pt", "en"], "pt"));
    await waitFor(() => expect(result.current.escolha).toEqual(["pt"]));
  });

  it("preferência com um idioma que a minuta já não tem: ignora esse idioma; sem nenhum, o base", async () => {
    guardarPreferencia("u1", "m1", ["en"]);
    const { result } = renderHook(() => useEscolhaDeIdiomas("m1", ["pt"], "pt"));
    await waitFor(() => expect(result.current.escolha).toEqual(["pt"]));
  });

  it("mudar a escolha atualiza-a e grava-a para a próxima vez", async () => {
    const { result } = renderHook(() => useEscolhaDeIdiomas("m1", ["pt", "en"], "pt"));
    await waitFor(() => expect(result.current.escolha).toEqual(["pt"]));
    act(() => result.current.mudar(["en"]));
    expect(result.current.escolha).toEqual(["en"]);
    await waitFor(() => expect(lerPreferencia("u1", "m1")).toEqual(["en"]));
  });

  it("mudar a minuta volta a pré-selecionar (não arrasta a escolha da anterior)", async () => {
    guardarPreferencia("u1", "m2", ["pt", "en"]);
    const { result, rerender } = renderHook(({ id }) => useEscolhaDeIdiomas(id, ["pt", "en"], "pt"), { initialProps: { id: "m1" } });
    await waitFor(() => expect(result.current.escolha).toEqual(["pt"]));
    act(() => result.current.mudar(["en"]));
    rerender({ id: "m2" });
    await waitFor(() => expect(result.current.escolha).toEqual(["pt", "en"]));
  });

  it("não consegue saber quem é o utilizador: usa o base e não grava nada", async () => {
    uid.falha = true;
    const { result } = renderHook(() => useEscolhaDeIdiomas("m1", ["pt", "en"], "pt"));
    act(() => result.current.mudar(["en"]));
    expect(result.current.escolha).toEqual(["en"]);
    await act(async () => { await Promise.resolve(); });
    expect(window.localStorage.length).toBe(0);
  });

  it("sem minuta escolhida: o base", () => {
    const { result } = renderHook(() => useEscolhaDeIdiomas(null, ["pt"], "pt"));
    expect(result.current.escolha).toEqual(["pt"]);
  });
});
