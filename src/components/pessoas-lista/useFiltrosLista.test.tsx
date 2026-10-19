import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFiltrosLista } from "./useFiltrosLista";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useFiltrosLista", () => {
  it("começa sem filtros, por «recentes»", () => {
    const { result } = renderHook(() => useFiltrosLista());
    expect(result.current.filtros).toEqual({ papel: null, etapa: null, pesquisa: "", ordem: "recentes" });
    expect(result.current.pesquisa).toBe("");
  });

  it("papel, etapa e ordem mudam logo", () => {
    const { result } = renderHook(() => useFiltrosLista());
    act(() => result.current.mudarPapel("cliente"));
    act(() => result.current.mudarEtapa("emContacto"));
    act(() => result.current.mudarOrdem("nome"));
    expect(result.current.filtros).toEqual({ papel: "cliente", etapa: "emContacto", pesquisa: "", ordem: "nome" });
  });

  it("a pesquisa só chega aos filtros 300 ms depois da última tecla, mas o campo mostra logo", () => {
    const { result } = renderHook(() => useFiltrosLista());
    act(() => result.current.mudarPesquisa("an"));
    act(() => { vi.advanceTimersByTime(299); });
    expect(result.current.pesquisa).toBe("an");
    expect(result.current.filtros.pesquisa).toBe("");
    act(() => result.current.mudarPesquisa("ana"));
    act(() => { vi.advanceTimersByTime(299); });
    expect(result.current.filtros.pesquisa).toBe("");
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.filtros.pesquisa).toBe("ana");
  });

  it("com 1 caractere não envia pesquisa", () => {
    const { result } = renderHook(() => useFiltrosLista());
    act(() => result.current.mudarPesquisa("a"));
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.pesquisa).toBe("a");
    expect(result.current.filtros.pesquisa).toBe("");
  });

  it("espaços à volta não contam para o mínimo", () => {
    const { result } = renderHook(() => useFiltrosLista());
    act(() => result.current.mudarPesquisa("  a "));
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.filtros.pesquisa).toBe("");
  });

  it("limpar repõe papel, etapa e pesquisa (a ordem fica)", () => {
    const { result } = renderHook(() => useFiltrosLista());
    act(() => result.current.mudarPapel("lead"));
    act(() => result.current.mudarEtapa("nova"));
    act(() => result.current.mudarOrdem("nome"));
    act(() => result.current.mudarPesquisa("ana"));
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current.filtros.pesquisa).toBe("ana");
    act(() => result.current.limpar());
    expect(result.current.pesquisa).toBe("");
    expect(result.current.filtros).toMatchObject({ papel: null, etapa: null, ordem: "nome" });
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current.filtros.pesquisa).toBe("");
  });

  it("os filtros mantêm a mesma referência enquanto nada muda", () => {
    const { result, rerender } = renderHook(() => useFiltrosLista());
    const antes = result.current.filtros;
    rerender();
    expect(result.current.filtros).toBe(antes);
  });
});
