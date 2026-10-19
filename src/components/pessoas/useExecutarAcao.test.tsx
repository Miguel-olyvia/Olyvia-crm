import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useExecutarAcao } from "./useExecutarAcao";

vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ language: "pt", t: (k: string) => k }) }));

const abrir = () => {
  let resolver: () => void = () => undefined;
  let rejeitar: (e: unknown) => void = () => undefined;
  const promessa = new Promise<void>((res, rej) => { resolver = res; rejeitar = rej; });
  return { promessa, resolver, rejeitar };
};

describe("useExecutarAcao", () => {
  it("uma ação síncrona não passa por «a guardar» e chama aoOk de imediato", () => {
    const { result } = renderHook(() => useExecutarAcao());
    const aoOk = vi.fn();
    act(() => result.current.executar(() => undefined, aoOk));
    expect(aoOk).toHaveBeenCalledTimes(1);
    expect(result.current.aGuardar).toBe(false);
    expect(result.current.erro).toBeNull();
  });

  it("uma ação assíncrona fica a guardar até terminar e só então chama aoOk", async () => {
    const { result } = renderHook(() => useExecutarAcao());
    const aoOk = vi.fn();
    const p = abrir();
    act(() => result.current.executar(() => p.promessa, aoOk));
    expect(result.current.aGuardar).toBe(true);
    expect(aoOk).not.toHaveBeenCalled();
    await act(async () => { p.resolver(); await p.promessa; });
    expect(result.current.aGuardar).toBe(false);
    expect(aoOk).toHaveBeenCalledTimes(1);
  });

  it("uma falha guarda a chave do erro, não chama aoOk e a tentativa seguinte limpa o erro", async () => {
    const { result } = renderHook(() => useExecutarAcao());
    const aoOk = vi.fn();
    const p = abrir();
    act(() => result.current.executar(() => p.promessa, aoOk));
    await act(async () => { p.rejeitar({ chave: "pessoasPagina.erroNeg.ng011" }); await p.promessa.catch(() => undefined); });
    expect(result.current.erro).toBe("pessoasPagina.erroNeg.ng011");
    expect(result.current.aGuardar).toBe(false);
    expect(aoOk).not.toHaveBeenCalled();
    const segunda = abrir();
    act(() => result.current.executar(() => segunda.promessa, aoOk));
    expect(result.current.erro).toBeNull();
    await act(async () => { segunda.resolver(); await segunda.promessa; });
    expect(aoOk).toHaveBeenCalledTimes(1);
  });

  it("um erro sem chave mostra a mensagem genérica", async () => {
    const { result } = renderHook(() => useExecutarAcao());
    await act(async () => { result.current.executar(() => Promise.reject(new Error("cru")), vi.fn()); await Promise.resolve(); });
    expect(result.current.erro).toBe("pessoasPagina.erroNeg.generico");
  });

  it("um segundo pedido enquanto guarda é ignorado (nada se faz duas vezes)", async () => {
    const { result } = renderHook(() => useExecutarAcao());
    const p = abrir();
    const acao = vi.fn(() => p.promessa);
    act(() => result.current.executar(acao, vi.fn()));
    act(() => result.current.executar(acao, vi.fn()));
    expect(acao).toHaveBeenCalledTimes(1);
    await act(async () => { p.resolver(); await p.promessa; });
  });

  it("se o componente sai antes de a ação terminar, nada rebenta nem chama aoOk", async () => {
    const { result, unmount } = renderHook(() => useExecutarAcao());
    const aoOk = vi.fn();
    const p = abrir();
    act(() => result.current.executar(() => p.promessa, aoOk));
    unmount();
    await act(async () => { p.resolver(); await p.promessa; });
    expect(aoOk).not.toHaveBeenCalled();
  });
});
