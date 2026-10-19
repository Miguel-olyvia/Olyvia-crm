// Telefone e email das linhas visíveis: uma leitura em lote por página (get_entity_contact_summary), nunca uma por linha.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpcMock(...a) } }));
const captureMock = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...a: unknown[]) => captureMock(...a) }));

import { FontePessoasContext, type FontePessoas } from "./useFontePessoas";
import { useContactosPessoas } from "./useContactosPessoas";

const real = (organizationId: string): FontePessoas => ({ modo: "real", organizationId, momentoGanho: null });
const ids = (n: number, de = 0): string[] => Array.from({ length: n }, (_, i) => `e${de + i}`);

function montar(fonte: FontePessoas = real("org-1"), client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <FontePessoasContext.Provider value={fonte}>{children}</FontePessoasContext.Provider>
    </QueryClientProvider>
  );
  return { client, wrapper };
}

const resposta = (linhas: unknown[]) => Promise.resolve({ data: linhas, error: null });
const entradas = (r: { current: ReadonlyMap<string, unknown> }) => [...r.current.keys()].sort();

describe("useContactosPessoas", () => {
  beforeEach(() => { rpcMock.mockReset(); captureMock.mockReset(); });

  it("sem ids não faz pedido nenhum", async () => {
    const { wrapper } = montar();
    const { result } = renderHook(() => useContactosPessoas([], true), { wrapper });
    await Promise.resolve();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  it("desligado (coluna escondida) não faz pedido", async () => {
    const { wrapper } = montar();
    renderHook(() => useContactosPessoas(ids(3), false), { wrapper });
    await Promise.resolve();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("em modo exemplo (sem organização) não faz pedido", async () => {
    const { wrapper } = montar({ modo: "exemplo" });
    renderHook(() => useContactosPessoas(ids(3), true), { wrapper });
    await Promise.resolve();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("uma página (≤100 ids) é UMA chamada, com os ids no parâmetro _entity_ids e sem repetidos", async () => {
    rpcMock.mockReturnValue(resposta([]));
    const { wrapper } = montar();
    renderHook(() => useContactosPessoas([...ids(100), "e0", "e5"], true), { wrapper });
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(rpcMock).toHaveBeenCalledWith("get_entity_contact_summary", { _entity_ids: expect.any(Array) });
    expect((rpcMock.mock.calls[0][1] as { _entity_ids: string[] })._entity_ids).toHaveLength(100);
  });

  it("150 ids são duas chamadas (100 e 50): o custo cresce por página, não por linha", async () => {
    rpcMock.mockReturnValue(resposta([]));
    const { wrapper } = montar();
    renderHook(() => useContactosPessoas(ids(150), true), { wrapper });
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    const tamanhos = rpcMock.mock.calls.map((c) => (c[1] as { _entity_ids: string[] })._entity_ids.length).sort((a, b) => a - b);
    expect(tamanhos).toEqual([50, 100]);
  });

  it("devolve telefone e email por pessoa; quem a função não devolve, e valores vazios, ficam a null", async () => {
    rpcMock.mockReturnValue(resposta([
      { entity_id: "e0", display_name: "A", email: "a@x.pt", phone_number: "912345678", last_interaction_at: null },
      { entity_id: "e1", display_name: "B", email: "", phone_number: null, last_interaction_at: null },
    ]));
    const { wrapper } = montar();
    const { result } = renderHook(() => useContactosPessoas(["e0", "e1", "e2"], true), { wrapper });
    await waitFor(() => expect(result.current.size).toBe(3));
    expect(result.current.get("e0")).toEqual({ telefone: "912345678", email: "a@x.pt" });
    expect(result.current.get("e1")).toEqual({ telefone: null, email: null });
    expect(result.current.get("e2")).toEqual({ telefone: null, email: null });
  });

  it("enquanto carrega não há entradas (ainda se não sabe), e os mesmos ids não repetem o pedido", async () => {
    rpcMock.mockReturnValue(new Promise(() => undefined));
    const { wrapper } = montar();
    const { result, rerender } = renderHook(() => useContactosPessoas(["e0"], true), { wrapper });
    expect(result.current.size).toBe(0);
    rerender();
    await Promise.resolve();
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("um lote que falha não bloqueia os outros: as suas pessoas ficam por saber e o erro é reportado", async () => {
    rpcMock.mockImplementation((_nome: string, p: { _entity_ids: string[] }) =>
      p._entity_ids.includes("e0")
        ? Promise.resolve({ data: null, error: { code: "57014", message: "timeout" } })
        : resposta([{ entity_id: "e100", display_name: "Z", email: "z@x.pt", phone_number: null, last_interaction_at: null }]));
    const { wrapper } = montar();
    const { result } = renderHook(() => useContactosPessoas(ids(101), true), { wrapper });
    await waitFor(() => expect(result.current.has("e100")).toBe(true));
    expect(result.current.get("e100")).toEqual({ telefone: null, email: "z@x.pt" });
    expect(result.current.has("e0")).toBe(false);
    expect(captureMock).toHaveBeenCalledWith(expect.objectContaining({ code: "57014" }), "pessoas-neg");
  });

  it("uma exceção na chamada também fica contida", async () => {
    rpcMock.mockReturnValue(Promise.reject(new Error("rede")));
    const { wrapper } = montar();
    const { result } = renderHook(() => useContactosPessoas(["e0"], true), { wrapper });
    await waitFor(() => expect(captureMock).toHaveBeenCalled());
    expect(entradas(result)).toEqual([]);
  });

  it("organizações diferentes não partilham a cache", async () => {
    rpcMock.mockReturnValue(resposta([]));
    const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    const a = renderHook(() => useContactosPessoas(["e0"], true), { wrapper: montar(real("org-1"), client).wrapper });
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    a.unmount();
    renderHook(() => useContactosPessoas(["e0"], true), { wrapper: montar(real("org-2"), client).wrapper });
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
  });
});
