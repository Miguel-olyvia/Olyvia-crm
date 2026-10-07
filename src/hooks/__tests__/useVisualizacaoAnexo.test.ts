/**
 * `useVisualizacaoAnexo`: carrega o ficheiro sensivel como blob (URL de objecto),
 * fecha sozinho ao fim de 2 minutos e, ao parar, revoga o URL e deixa de guardar
 * o ficheiro.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { DURACAO_VISUALIZACAO_MS, useVisualizacaoAnexo } from "../useVisualizacaoAnexo";

const obterUrl = vi.fn();
const aoExpirar = vi.fn();

const criarUrl = vi.fn();
const revogarUrl = vi.fn();
const fetchFalso = vi.fn();

function resposta(tipo: string, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    blob: async () => new Blob(["conteudo"], { type: tipo }),
  };
}

describe("useVisualizacaoAnexo", () => {
  const urlOriginal = { criar: URL.createObjectURL, revogar: URL.revokeObjectURL };

  beforeEach(() => {
    obterUrl.mockReset();
    aoExpirar.mockReset();
    criarUrl.mockReset().mockReturnValue("blob:ficheiro-1");
    revogarUrl.mockReset();
    fetchFalso.mockReset();
    URL.createObjectURL = criarUrl as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revogarUrl as unknown as typeof URL.revokeObjectURL;
    vi.stubGlobal("fetch", fetchFalso);
    obterUrl.mockResolvedValue({ url: "https://x/assinado?token=1", expiraEmSegundos: 60, mime_type: "application/pdf", tipo: "cartao_cidadao" });
    fetchFalso.mockResolvedValue(resposta("application/pdf"));
  });

  afterEach(() => {
    URL.createObjectURL = urlOriginal.criar;
    URL.revokeObjectURL = urlOriginal.revogar;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("sem anexo escolhido nao pede nada", () => {
    const { result } = renderHook(() => useVisualizacaoAnexo({ anexoId: null, obterUrl, aoExpirar }));
    expect(result.current.fase).toBe("inactivo");
    expect(obterUrl).not.toHaveBeenCalled();
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("pede o URL do anexo, descarrega-o como blob e entrega um URL de objecto", async () => {
    const { result } = renderHook(() => useVisualizacaoAnexo({ anexoId: "c1", obterUrl, aoExpirar }));
    expect(result.current.fase).toBe("a_carregar");
    await waitFor(() => expect(result.current.fase).toBe("pronto"));
    expect(obterUrl).toHaveBeenCalledWith("c1");
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(fetchFalso.mock.calls[0][0]).toBe("https://x/assinado?token=1");
    expect(fetchFalso.mock.calls[0][1]).toMatchObject({ credentials: "omit" });
    if (result.current.fase === "pronto") {
      expect(result.current.url).toBe("blob:ficheiro-1");
      expect(result.current.mime).toBe("application/pdf");
    }
  });

  it("o tipo do blob e o que o servidor diz (ou o do blob), nunca um tipo que nao se mostra", async () => {
    obterUrl.mockResolvedValue({ url: "https://x/1", expiraEmSegundos: 60, mime_type: "text/html", tipo: "cartao_cidadao" });
    fetchFalso.mockResolvedValue(resposta("text/html"));
    const { result } = renderHook(() => useVisualizacaoAnexo({ anexoId: "c1", obterUrl, aoExpirar }));
    await waitFor(() => expect(result.current.fase).toBe("erro"));
    expect(criarUrl).not.toHaveBeenCalled();
  });

  it("sem mime do servidor usa o do blob (imagem)", async () => {
    obterUrl.mockResolvedValue({ url: "https://x/1", expiraEmSegundos: 60, mime_type: null, tipo: null });
    fetchFalso.mockResolvedValue(resposta("image/png"));
    const { result } = renderHook(() => useVisualizacaoAnexo({ anexoId: "c1", obterUrl, aoExpirar }));
    await waitFor(() => expect(result.current.fase).toBe("pronto"));
    if (result.current.fase === "pronto") expect(result.current.mime).toBe("image/png");
  });

  it("se o pedido do URL falha, diz erro e nao descarrega nada", async () => {
    obterUrl.mockRejectedValue(new Error("falhou"));
    const { result } = renderHook(() => useVisualizacaoAnexo({ anexoId: "c1", obterUrl, aoExpirar }));
    await waitFor(() => expect(result.current.fase).toBe("erro"));
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("se o descarregamento falha (http), diz erro", async () => {
    fetchFalso.mockResolvedValue(resposta("application/pdf", false));
    const { result } = renderHook(() => useVisualizacaoAnexo({ anexoId: "c1", obterUrl, aoExpirar }));
    await waitFor(() => expect(result.current.fase).toBe("erro"));
    expect(criarUrl).not.toHaveBeenCalled();
  });

  it("ao desmontar revoga o URL de objecto", async () => {
    const { result, unmount } = renderHook(() => useVisualizacaoAnexo({ anexoId: "c1", obterUrl, aoExpirar }));
    await waitFor(() => expect(result.current.fase).toBe("pronto"));
    expect(revogarUrl).not.toHaveBeenCalled();
    unmount();
    expect(revogarUrl).toHaveBeenCalledWith("blob:ficheiro-1");
  });

  it("ao deixar de ter anexo (fechar) revoga o URL e volta a inactivo, sem ficheiro guardado", async () => {
    const { result, rerender } = renderHook(
      ({ anexoId }: { anexoId: string | null }) => useVisualizacaoAnexo({ anexoId, obterUrl, aoExpirar }),
      { initialProps: { anexoId: "c1" as string | null } },
    );
    await waitFor(() => expect(result.current.fase).toBe("pronto"));
    rerender({ anexoId: null });
    expect(revogarUrl).toHaveBeenCalledWith("blob:ficheiro-1");
    expect(result.current.fase).toBe("inactivo");
  });

  it("a resposta que chega depois de fechar nao cria URL de objecto", async () => {
    let resolver!: (v: unknown) => void;
    fetchFalso.mockReturnValue(new Promise((r) => (resolver = r)));
    const { rerender } = renderHook(
      ({ anexoId }: { anexoId: string | null }) => useVisualizacaoAnexo({ anexoId, obterUrl, aoExpirar }),
      { initialProps: { anexoId: "c1" as string | null } },
    );
    await waitFor(() => expect(fetchFalso).toHaveBeenCalled());
    rerender({ anexoId: null });
    await act(async () => {
      resolver(resposta("application/pdf"));
    });
    expect(criarUrl).not.toHaveBeenCalled();
  });

  it("aos 2 minutos chama aoExpirar (relogio simulado) e nao antes", async () => {
    vi.useFakeTimers();
    renderHook(() => useVisualizacaoAnexo({ anexoId: "c1", obterUrl, aoExpirar }));
    expect(DURACAO_VISUALIZACAO_MS).toBe(120_000);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DURACAO_VISUALIZACAO_MS - 1);
    });
    expect(aoExpirar).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(aoExpirar).toHaveBeenCalledTimes(1);
  });

  it("fechar antes do tempo cancela o temporizador", async () => {
    vi.useFakeTimers();
    const { rerender } = renderHook(
      ({ anexoId }: { anexoId: string | null }) => useVisualizacaoAnexo({ anexoId, obterUrl, aoExpirar }),
      { initialProps: { anexoId: "c1" as string | null } },
    );
    rerender({ anexoId: null });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DURACAO_VISUALIZACAO_MS * 2);
    });
    expect(aoExpirar).not.toHaveBeenCalled();
  });
});
