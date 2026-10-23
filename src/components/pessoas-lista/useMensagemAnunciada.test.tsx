// A mensagem que a «Nova lead» entrega à região viva da página: some passado um tempo (para não voltar a ser lida com cada mudança
// da região) e duas mensagens iguais seguidas anunciam-se as duas.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ATRASO_LIMPAR_MS, useMensagemAnunciada } from "./useMensagemAnunciada";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useMensagemAnunciada", () => {
  it("começa vazia e guarda a mensagem anunciada", () => {
    const { result } = renderHook(() => useMensagemAnunciada());
    expect(result.current.mensagem).toBe("");
    act(() => result.current.anunciar("Lead criada: Ana."));
    expect(result.current.mensagem.trim()).toBe("Lead criada: Ana.");
  });

  it("limpa a mensagem passado o atraso", () => {
    const { result } = renderHook(() => useMensagemAnunciada());
    act(() => result.current.anunciar("Lead criada: Ana."));
    act(() => { vi.advanceTimersByTime(ATRASO_LIMPAR_MS - 1); });
    expect(result.current.mensagem).not.toBe("");
    act(() => { vi.advanceTimersByTime(2); });
    expect(result.current.mensagem).toBe("");
  });

  it("duas mensagens iguais seguidas dão texto diferente no DOM (senão a segunda não se anunciava)", () => {
    const { result } = renderHook(() => useMensagemAnunciada());
    act(() => result.current.anunciar("Lead criada: Ana."));
    const primeira = result.current.mensagem;
    act(() => result.current.anunciar("Lead criada: Ana."));
    expect(result.current.mensagem).not.toBe(primeira);
    expect(result.current.mensagem.trim()).toBe("Lead criada: Ana.");
  });

  it("uma mensagem nova reinicia o relógio: a primeira não a apaga cedo de mais", () => {
    const { result } = renderHook(() => useMensagemAnunciada());
    act(() => result.current.anunciar("A"));
    act(() => { vi.advanceTimersByTime(ATRASO_LIMPAR_MS - 100); });
    act(() => result.current.anunciar("B"));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.mensagem.trim()).toBe("B");
  });

  it("anunciar texto vazio limpa já; ao desmontar não fica relógio a correr", () => {
    const { result, unmount } = renderHook(() => useMensagemAnunciada());
    act(() => result.current.anunciar("A"));
    act(() => result.current.anunciar(""));
    expect(result.current.mensagem).toBe("");
    act(() => result.current.anunciar("B"));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("o anunciar é estável entre renders (vai para um componente com memória)", () => {
    const { result, rerender } = renderHook(() => useMensagemAnunciada());
    const antes = result.current.anunciar;
    rerender();
    expect(result.current.anunciar).toBe(antes);
  });
});
