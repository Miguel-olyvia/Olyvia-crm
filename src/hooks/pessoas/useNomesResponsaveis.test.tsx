// O nome do comercial de cada linha: uma consulta em lote por página a anew_users, como a página de Leads.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const inMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (...a: unknown[]) => fromMock(...a) } }));
const captureMock = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...a: unknown[]) => captureMock(...a) }));

import { FontePessoasContext, type FontePessoas } from "./useFontePessoas";
import { useNomesResponsaveis } from "./useNomesResponsaveis";

const real = (organizationId: string): FontePessoas => ({ modo: "real", organizationId, momentoGanho: null });
const ids = (n: number, de = 0): string[] => Array.from({ length: n }, (_, i) => `u${de + i}`);

function montar(fonte: FontePessoas = real("org-1"), client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <FontePessoasContext.Provider value={fonte}>{children}</FontePessoasContext.Provider>
    </QueryClientProvider>
  );
  return { client, wrapper };
}

const resposta = (linhas: unknown[]) => Promise.resolve({ data: linhas, error: null });
const idsDoPedido = (n: number): string[] => inMock.mock.calls[n][1] as string[];

describe("useNomesResponsaveis", () => {
  beforeEach(() => {
    [inMock, selectMock, fromMock, captureMock].forEach((m) => m.mockReset());
    selectMock.mockReturnValue({ in: inMock });
    fromMock.mockReturnValue({ select: selectMock });
  });

  it("sem ids (ou só null) não faz pedido", async () => {
    const { wrapper } = montar();
    const { result } = renderHook(() => useNomesResponsaveis([null, null], true), { wrapper });
    await Promise.resolve();
    expect(fromMock).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  it("desligado (coluna escondida) não faz pedido", async () => {
    const { wrapper } = montar();
    renderHook(() => useNomesResponsaveis(["u1"], false), { wrapper });
    await Promise.resolve();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("ids repetidos dão um só pedido, a anew_users, com id e name e cada id uma vez", async () => {
    inMock.mockReturnValue(resposta([]));
    const { wrapper } = montar();
    renderHook(() => useNomesResponsaveis(["u1", "u2", "u1", null, "u2", "u1"], true), { wrapper });
    await waitFor(() => expect(inMock).toHaveBeenCalledTimes(1));
    expect(fromMock).toHaveBeenCalledWith("anew_users");
    expect(selectMock).toHaveBeenCalledWith("id, name");
    expect(inMock).toHaveBeenCalledWith("id", expect.any(Array));
    expect([...idsDoPedido(0)].sort()).toEqual(["u1", "u2"]);
  });

  it("150 responsáveis diferentes são dois pedidos (100 e 50)", async () => {
    inMock.mockReturnValue(resposta([]));
    const { wrapper } = montar();
    renderHook(() => useNomesResponsaveis(ids(150), true), { wrapper });
    await waitFor(() => expect(inMock).toHaveBeenCalledTimes(2));
    expect([idsDoPedido(0).length, idsDoPedido(1).length].sort((a, b) => a - b)).toEqual([50, 100]);
  });

  it("devolve o nome de cada id; um nome vazio ou nulo não entra (a linha mostra «Sem dado»)", async () => {
    inMock.mockReturnValue(resposta([{ id: "u1", name: "Rui Dias" }, { id: "u2", name: "  " }, { id: "u3", name: null }]));
    const { wrapper } = montar();
    const { result } = renderHook(() => useNomesResponsaveis(["u1", "u2", "u3", "u4"], true), { wrapper });
    await waitFor(() => expect(result.current.get("u1")).toBe("Rui Dias"));
    expect(result.current.has("u2")).toBe(false);
    expect(result.current.has("u3")).toBe(false);
    expect(result.current.has("u4")).toBe(false);
  });

  it("um erro não lança nem bloqueia: mapa vazio e o erro é reportado", async () => {
    inMock.mockReturnValue(Promise.resolve({ data: null, error: { code: "42501", message: "negado" } }));
    const { wrapper } = montar();
    const { result } = renderHook(() => useNomesResponsaveis(["u1"], true), { wrapper });
    await waitFor(() => expect(captureMock).toHaveBeenCalled());
    expect(result.current.size).toBe(0);
    expect(captureMock).toHaveBeenCalledWith(expect.objectContaining({ code: "42501" }), "pessoas-neg");
  });

  it("os mesmos ids não repetem o pedido", async () => {
    inMock.mockReturnValue(resposta([{ id: "u1", name: "Rui" }]));
    const { wrapper } = montar();
    const { result, rerender } = renderHook(() => useNomesResponsaveis(["u1"], true), { wrapper });
    await waitFor(() => expect(result.current.size).toBe(1));
    rerender();
    expect(inMock).toHaveBeenCalledTimes(1);
  });

  it("organizações diferentes não partilham a cache", async () => {
    inMock.mockReturnValue(resposta([]));
    const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    const a = renderHook(() => useNomesResponsaveis(["u1"], true), { wrapper: montar(real("org-1"), client).wrapper });
    await waitFor(() => expect(inMock).toHaveBeenCalledTimes(1));
    a.unmount();
    renderHook(() => useNomesResponsaveis(["u1"], true), { wrapper: montar(real("org-2"), client).wrapper });
    await waitFor(() => expect(inMock).toHaveBeenCalledTimes(2));
  });

  it("em modo exemplo não faz pedido", async () => {
    const { wrapper } = montar({ modo: "exemplo" });
    renderHook(() => useNomesResponsaveis(["u1"], true), { wrapper });
    await Promise.resolve();
    expect(fromMock).not.toHaveBeenCalled();
  });
});
