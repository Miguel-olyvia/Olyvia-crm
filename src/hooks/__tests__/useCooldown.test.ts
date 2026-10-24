import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCooldown } from "../useCooldown";

describe("useCooldown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("começa inactivo", () => {
    const { result } = renderHook(() => useCooldown(60));
    expect(result.current.activo).toBe(false);
    expect(result.current.restante).toBe(0);
  });

  it("iniciar() activa a contagem a partir do total e conta em segundos inteiros", () => {
    const { result } = renderHook(() => useCooldown(60));
    act(() => { result.current.iniciar(); });
    expect(result.current.activo).toBe(true);
    expect(result.current.restante).toBe(60);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.restante).toBe(59);
    act(() => { vi.advanceTimersByTime(14000); });
    expect(result.current.restante).toBe(45);
  });

  it("chega a 0, fica inactivo e não fica negativo", () => {
    const { result } = renderHook(() => useCooldown(3));
    act(() => { result.current.iniciar(); });
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.restante).toBe(0);
    expect(result.current.activo).toBe(false);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(result.current.restante).toBe(0);
  });

  it("iniciar() enquanto activo não reinicia a contagem", () => {
    const { result } = renderHook(() => useCooldown(60));
    act(() => { result.current.iniciar(); });
    act(() => { vi.advanceTimersByTime(20000); });
    act(() => { result.current.iniciar(); });
    expect(result.current.restante).toBe(40);
  });

  it("duas chamadas seguidas no mesmo instante contam como uma só", () => {
    const { result } = renderHook(() => useCooldown(60));
    act(() => {
      result.current.iniciar();
      result.current.iniciar();
    });
    expect(result.current.restante).toBe(60);
  });

  it("iniciar() devolve true só quando realmente começou a contagem", () => {
    const { result } = renderHook(() => useCooldown(60));
    const started: boolean[] = [];
    act(() => {
      started.push(result.current.iniciar());
      started.push(result.current.iniciar());
    });
    expect(started).toEqual([true, false]);
  });

  it("pode voltar a iniciar depois de terminar", () => {
    const { result } = renderHook(() => useCooldown(2));
    act(() => { result.current.iniciar(); });
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { result.current.iniciar(); });
    expect(result.current.restante).toBe(2);
  });

  it("limpa o intervalo ao desmontar", () => {
    const { result, unmount } = renderHook(() => useCooldown(60));
    act(() => { result.current.iniciar(); });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cada instância tem a sua contagem e nada fica guardado entre montagens", () => {
    const first = renderHook(() => useCooldown(60));
    act(() => { first.result.current.iniciar(); });
    first.unmount();
    const second = renderHook(() => useCooldown(60));
    expect(second.result.current.activo).toBe(false);
    expect(second.result.current.restante).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("a função iniciar mantém-se estável entre renders", () => {
    const { result, rerender } = renderHook(() => useCooldown(60));
    const before = result.current.iniciar;
    rerender();
    expect(result.current.iniciar).toBe(before);
  });
});
