/**
 * `usePessoaFotografia`: o URL assinado da fotografia do cabecalho da ficha.
 * Renova antes de expirar, nunca o persiste, e cai nas iniciais (url nulo)
 * quando nao ha fotografia ou o pedido falha. Supabase e tempo simulados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

const captureFlowError = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureFlowError(...args),
}));

import { usePessoaFotografia } from "../usePessoaFotografia";

function urlNumero(n: number) {
  return {
    data: { url: `https://x/foto-${n}`, expiraEmSegundos: 300, tipo: "fotografia", mime_type: "image/png" },
    error: null,
  };
}

/** Deixa as promessas pendentes correrem, com o relogio simulado. */
async function esvaziar() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function avancar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  invoke.mockReset();
  captureFlowError.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("usePessoaFotografia", () => {
  it("sem id devolve null e nao faz pedido nenhum", async () => {
    const { result } = renderHook(() => usePessoaFotografia(null));
    await esvaziar();
    expect(result.current).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("com id pede o URL a hr-anexo-url so com o id do anexo", async () => {
    invoke.mockResolvedValue(urlNumero(1));
    const { result } = renderHook(() => usePessoaFotografia("foto-1"));
    await esvaziar();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("hr-anexo-url", { body: { anexoId: "foto-1" } });
    expect(result.current).toBe("https://x/foto-1");
  });

  it("nao volta a pedir antes dos 240 s e renova aos 240 s (o URL vale 300 s)", async () => {
    invoke.mockResolvedValueOnce(urlNumero(1)).mockResolvedValueOnce(urlNumero(2));
    const { result } = renderHook(() => usePessoaFotografia("foto-1"));
    await esvaziar();

    await avancar(239_000);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(result.current).toBe("https://x/foto-1");

    await avancar(1_000);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(result.current).toBe("https://x/foto-2");
  });

  it("um pedido falhado devolve null (cai nas iniciais) e nao fica a insistir", async () => {
    invoke.mockResolvedValue({ data: null, error: { context: { status: 500 }, message: "boom" } });
    const { result } = renderHook(() => usePessoaFotografia("foto-1"));
    await esvaziar();
    expect(result.current).toBeNull();
    await avancar(600_000);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("uma renovacao que falha (5xx) mantem o URL ate expirar e tenta de novo pouco depois", async () => {
    invoke
      .mockResolvedValueOnce(urlNumero(1))
      .mockResolvedValueOnce({ data: null, error: { context: { status: 503 }, message: "boom" } })
      .mockResolvedValueOnce(urlNumero(2));
    const { result } = renderHook(() => usePessoaFotografia("foto-1"));
    await esvaziar();

    await avancar(240_000);
    expect(invoke).toHaveBeenCalledTimes(2);
    // O URL antigo ainda vale: a fotografia nao desaparece.
    expect(result.current).toBe("https://x/foto-1");

    await avancar(15_000);
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(result.current).toBe("https://x/foto-2");
  });

  it("uma renovacao que falha de rede (excepcao) tambem mantem o URL e reagenda", async () => {
    invoke
      .mockResolvedValueOnce(urlNumero(1))
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce(urlNumero(2));
    const { result } = renderHook(() => usePessoaFotografia("foto-1"));
    await esvaziar();
    await avancar(240_000);
    expect(result.current).toBe("https://x/foto-1");
    await avancar(15_000);
    expect(result.current).toBe("https://x/foto-2");
  });

  it("depois de 3 tentativas de renovacao falhadas desiste, limpa o URL e para de pedir", async () => {
    invoke
      .mockResolvedValueOnce(urlNumero(1))
      .mockResolvedValue({ data: null, error: { context: { status: 500 }, message: "boom" } });
    const { result } = renderHook(() => usePessoaFotografia("foto-1"));
    await esvaziar();
    await avancar(240_000);
    await avancar(15_000);
    await avancar(15_000);
    expect(invoke).toHaveBeenCalledTimes(4);
    expect(result.current).toBeNull();
    await avancar(600_000);
    expect(invoke).toHaveBeenCalledTimes(4);
  });

  it("uma renovacao recusada por permissao (403) limpa o URL logo e nao insiste", async () => {
    invoke
      .mockResolvedValueOnce(urlNumero(1))
      .mockResolvedValue({ data: null, error: { context: { status: 403 }, message: "forbidden" } });
    const { result } = renderHook(() => usePessoaFotografia("foto-1"));
    await esvaziar();
    await avancar(240_000);
    expect(result.current).toBeNull();
    await avancar(600_000);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("um sucesso apos falha repoe o contador de tentativas", async () => {
    const falha = { data: null, error: { context: { status: 500 }, message: "boom" } };
    invoke
      .mockResolvedValueOnce(urlNumero(1))
      .mockResolvedValueOnce(falha)
      .mockResolvedValueOnce(urlNumero(2))
      .mockResolvedValueOnce(falha)
      .mockResolvedValueOnce(falha)
      .mockResolvedValueOnce(urlNumero(3));
    const { result } = renderHook(() => usePessoaFotografia("foto-1"));
    await esvaziar();
    await avancar(240_000);
    await avancar(15_000);
    expect(result.current).toBe("https://x/foto-2");
    await avancar(240_000);
    await avancar(15_000);
    await avancar(15_000);
    expect(result.current).toBe("https://x/foto-3");
  });

  it("uma recusa de permissao devolve null sem registar erro", async () => {
    invoke.mockResolvedValue({ data: null, error: { context: { status: 403 }, message: "forbidden" } });
    const { result } = renderHook(() => usePessoaFotografia("foto-1"));
    await esvaziar();
    expect(result.current).toBeNull();
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("se o id passa a null, o URL desaparece e o temporizador para", async () => {
    invoke.mockResolvedValue(urlNumero(1));
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => usePessoaFotografia(id),
      { initialProps: { id: "foto-1" as string | null } },
    );
    await esvaziar();
    expect(result.current).toBe("https://x/foto-1");

    rerender({ id: null });
    await esvaziar();
    expect(result.current).toBeNull();
    await avancar(600_000);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("se o id muda, pede o URL da nova fotografia", async () => {
    invoke.mockResolvedValueOnce(urlNumero(1)).mockResolvedValueOnce(urlNumero(2));
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => usePessoaFotografia(id),
      { initialProps: { id: "foto-1" as string | null } },
    );
    await esvaziar();
    rerender({ id: "foto-2" });
    await esvaziar();
    expect(invoke).toHaveBeenLastCalledWith("hr-anexo-url", { body: { anexoId: "foto-2" } });
    expect(result.current).toBe("https://x/foto-2");
  });

  it("ao desmontar, para de renovar", async () => {
    invoke.mockResolvedValue(urlNumero(1));
    const { unmount } = renderHook(() => usePessoaFotografia("foto-1"));
    await esvaziar();
    unmount();
    await avancar(600_000);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("nunca persiste o URL em armazenamento do navegador", async () => {
    invoke.mockResolvedValue(urlNumero(1));
    renderHook(() => usePessoaFotografia("foto-1"));
    await esvaziar();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
