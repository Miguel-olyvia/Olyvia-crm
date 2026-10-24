// O foco que se devolve «depois» de um diálogo fechar: um adiamento que se cancela se o componente desmontar, e que não se acumula.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFocoDepois } from "./useFocoDepois";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const alvo = () => ({ current: { focus: vi.fn() } as unknown as HTMLElement });

describe("useFocoDepois", () => {
  it("dá o foco ao alvo no ciclo seguinte, não de imediato", () => {
    const a = alvo();
    const { result } = renderHook(() => useFocoDepois());
    result.current(a);
    expect(a.current.focus).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(a.current.focus).toHaveBeenCalledTimes(1);
  });

  it("se o componente desmontou antes, não dá o foco a ninguém", () => {
    const a = alvo();
    const { result, unmount } = renderHook(() => useFocoDepois());
    result.current(a);
    unmount();
    vi.runAllTimers();
    expect(a.current.focus).not.toHaveBeenCalled();
  });

  it("dois pedidos seguidos dão o foco só ao último", () => {
    const a = alvo();
    const b = alvo();
    const { result } = renderHook(() => useFocoDepois());
    result.current(a);
    result.current(b);
    vi.runAllTimers();
    expect(a.current.focus).not.toHaveBeenCalled();
    expect(b.current.focus).toHaveBeenCalledTimes(1);
  });

  it("um alvo que já não está no ecrã (ref vazia) não rebenta", () => {
    const { result } = renderHook(() => useFocoDepois());
    result.current({ current: null });
    expect(() => vi.runAllTimers()).not.toThrow();
  });
});
