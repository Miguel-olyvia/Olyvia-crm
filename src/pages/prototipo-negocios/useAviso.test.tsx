import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAviso } from "./useAviso";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("useAviso · a mesma mensagem volta a ser anunciada", () => {
  it("limpa antes de definir: a região viva passa por vazio entre duas mensagens iguais", () => {
    const { result } = renderHook(() => useAviso());
    const vistos: string[] = [];
    act(() => result.current[1]("Copiado: telefone"));
    expect(result.current[0]).toBe("");
    act(() => { vi.runAllTimers(); });
    vistos.push(result.current[0]);
    act(() => result.current[1]("Copiado: telefone"));
    vistos.push(result.current[0]);
    act(() => { vi.runAllTimers(); });
    vistos.push(result.current[0]);
    expect(vistos).toEqual(["Copiado: telefone", "", "Copiado: telefone"]);
  });
  it("duas mensagens seguidas anunciam só a última, e desmontar não deixa temporizadores", () => {
    const { result, unmount } = renderHook(() => useAviso());
    act(() => { result.current[1]("a"); result.current[1]("b"); });
    act(() => { vi.runAllTimers(); });
    expect(result.current[0]).toBe("b");
    act(() => result.current[1]("c"));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
