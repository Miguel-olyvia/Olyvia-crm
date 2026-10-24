// Telefone e email das linhas visíveis, lidos da própria entidade: um só pedido direto às entidades (colunas email e phone)
// por lote de 100, nunca um por linha.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (...a: unknown[]) => fromMock(...a) } }));
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

type Resp = { data: unknown[] | null; error: unknown };
const ok = (linhas: unknown[]): Resp => ({ data: linhas, error: null });
const entradas = (r: { current: ReadonlyMap<string, unknown> }) => [...r.current.keys()].sort();

interface Pedido { tabela: string; colunas: string; filtroIn: [string, string[]] }
const pedidos: Pedido[] = [];
type Respondedor = (p: Pedido) => Resp | Promise<Resp>;

/** Simula supabase.from(tabela).select(colunas).in(col, ids): um só pedido por lote, à tabela das entidades. */
function simular(responder: Respondedor) {
  pedidos.length = 0;
  fromMock.mockImplementation((tabela: string) => ({
    select: (colunas: string) => ({
      in: (col: string, idsIn: string[]) => {
        const p: Pedido = { tabela, colunas, filtroIn: [col, idsIn] };
        pedidos.push(p);
        return Promise.resolve(responder(p));
      },
    }),
  }));
}
const entidades = (linhas: unknown[]): Respondedor => () => ok(linhas);
const idsDeLotes = (): string[][] => pedidos.map((p) => p.filtroIn[1]);

describe("useContactosPessoas", () => {
  beforeEach(() => { fromMock.mockReset(); captureMock.mockReset(); pedidos.length = 0; });

  it("sem ids não faz pedido nenhum", async () => {
    simular(entidades([]));
    const { wrapper } = montar();
    const { result } = renderHook(() => useContactosPessoas([], true), { wrapper });
    await Promise.resolve();
    expect(fromMock).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  it("desligado (colunas escondidas) não faz pedido", async () => {
    simular(entidades([]));
    const { wrapper } = montar();
    renderHook(() => useContactosPessoas(ids(3), false), { wrapper });
    await Promise.resolve();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("em modo exemplo (sem organização) não faz pedido", async () => {
    simular(entidades([]));
    const { wrapper } = montar({ modo: "exemplo" });
    renderHook(() => useContactosPessoas(ids(3), true), { wrapper });
    await Promise.resolve();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("uma página é UM pedido às entidades: .in(id) com as colunas email e phone, sem repetidos e sem tocar nos satélites antigos", async () => {
    simular(entidades([]));
    const { wrapper } = montar();
    renderHook(() => useContactosPessoas([...ids(100), "e0", "e5"], true), { wrapper });
    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(pedidos[0]).toMatchObject({ tabela: "anew_entities", colunas: "id, email, phone" });
    expect(pedidos[0].filtroIn[0]).toBe("id");
    expect(pedidos[0].filtroIn[1]).toHaveLength(100);
    expect(fromMock).not.toHaveBeenCalledWith("anew_entity_emails");
    expect(fromMock).not.toHaveBeenCalledWith("anew_entity_phones");
  });

  it("150 ids são dois lotes (100 e 50), um pedido cada: o custo cresce por página, não por linha", async () => {
    simular(entidades([]));
    const { wrapper } = montar();
    renderHook(() => useContactosPessoas(ids(150), true), { wrapper });
    await waitFor(() => expect(pedidos).toHaveLength(2));
    expect(idsDeLotes().map((l) => l.length).sort((a, b) => a - b)).toEqual([50, 100]);
  });

  it("devolve telefone e email por pessoa; entidades sem contacto, em falta e valores vazios ficam a null", async () => {
    simular(entidades([
      { id: "e0", email: "a@x.pt", phone: " 912345678 " },
      { id: "e1", email: "  ", phone: null },
    ]));
    const { wrapper } = montar();
    const { result } = renderHook(() => useContactosPessoas(["e0", "e1", "e2"], true), { wrapper });
    await waitFor(() => expect(result.current.size).toBe(3));
    expect(result.current.get("e0")).toEqual({ telefone: "912345678", email: "a@x.pt" });
    expect(result.current.get("e1")).toEqual({ telefone: null, email: null });
    expect(result.current.get("e2")).toEqual({ telefone: null, email: null });
  });

  it("quem tem telefone mas não email (e o contrário) fica só com o que tem", async () => {
    simular(entidades([{ id: "e0", email: null, phone: "911111111" }, { id: "e1", email: "b@x.pt", phone: null }]));
    const { wrapper } = montar();
    const { result } = renderHook(() => useContactosPessoas(["e0", "e1"], true), { wrapper });
    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.get("e0")).toEqual({ telefone: "911111111", email: null });
    expect(result.current.get("e1")).toEqual({ telefone: null, email: "b@x.pt" });
  });

  it("enquanto carrega não há entradas (ainda se não sabe), e os mesmos ids não repetem os pedidos", async () => {
    simular(() => new Promise<Resp>(() => undefined));
    const { wrapper } = montar();
    const { result, rerender } = renderHook(() => useContactosPessoas(["e0"], true), { wrapper });
    expect(result.current.size).toBe(0);
    rerender();
    await Promise.resolve();
    expect(pedidos).toHaveLength(1);
  });

  it("um erro no pedido deixa a pessoa por saber (nunca um valor falso) e o erro é reportado", async () => {
    simular(() => ({ data: null, error: { code: "57014", message: "timeout" } }));
    const { wrapper } = montar();
    const { result } = renderHook(() => useContactosPessoas(["e0"], true), { wrapper });
    await waitFor(() => expect(captureMock).toHaveBeenCalledWith(expect.objectContaining({ code: "57014" }), "pessoas-neg"));
    expect(result.current.has("e0")).toBe(false);
  });

  it("um lote que falha não bloqueia os outros", async () => {
    simular((p) => (p.filtroIn[1].includes("e0")
      ? { data: null, error: { code: "57014", message: "timeout" } }
      : ok([{ id: "e100", email: "z@x.pt", phone: null }])));
    const { wrapper } = montar();
    const { result } = renderHook(() => useContactosPessoas(ids(101), true), { wrapper });
    await waitFor(() => expect(result.current.has("e100")).toBe(true));
    expect(result.current.get("e100")).toEqual({ telefone: null, email: "z@x.pt" });
    expect(result.current.has("e0")).toBe(false);
    expect(captureMock).toHaveBeenCalledWith(expect.objectContaining({ code: "57014" }), "pessoas-neg");
  });

  it("uma exceção num pedido também fica contida", async () => {
    simular(() => Promise.reject(new Error("rede")) as unknown as Resp);
    const { wrapper } = montar();
    const { result } = renderHook(() => useContactosPessoas(["e0"], true), { wrapper });
    await waitFor(() => expect(captureMock).toHaveBeenCalled());
    expect(entradas(result)).toEqual([]);
  });

  it("organizações diferentes não partilham a cache", async () => {
    simular(entidades([]));
    const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    const a = renderHook(() => useContactosPessoas(["e0"], true), { wrapper: montar(real("org-1"), client).wrapper });
    await waitFor(() => expect(pedidos).toHaveLength(1));
    a.unmount();
    renderHook(() => useContactosPessoas(["e0"], true), { wrapper: montar(real("org-2"), client).wrapper });
    await waitFor(() => expect(pedidos).toHaveLength(2));
  });
});

describe("useContactosPessoas: o último valor conhecido não pisca", () => {
  beforeEach(() => { fromMock.mockReset(); captureMock.mockReset(); pedidos.length = 0; });

  const quandoHaE2Fica = (conhecido: Respondedor): Respondedor => (p) => (p.filtroIn[1].includes("e2") ? new Promise<Resp>(() => undefined) : conhecido(p));

  it("ao mudar a lista o contacto já conhecido mantém-se enquanto o novo lote carrega", async () => {
    simular(quandoHaE2Fica(entidades([{ id: "e1", email: "a@x.pt", phone: "912345678" }])));
    const { wrapper } = montar();
    const { result, rerender } = renderHook(({ lista }) => useContactosPessoas(lista, true), { wrapper, initialProps: { lista: ["e1"] } });
    await waitFor(() => expect(result.current.get("e1")).toEqual({ telefone: "912345678", email: "a@x.pt" }));
    rerender({ lista: ["e2", "e1"] });
    await waitFor(() => expect(pedidos).toHaveLength(2));
    expect(result.current.get("e1")).toEqual({ telefone: "912345678", email: "a@x.pt" });
    expect(result.current.has("e2")).toBe(false);
  });

  it("noutra organização não se mostra nada da anterior, nem enquanto carrega", async () => {
    simular(quandoHaE2Fica(entidades([{ id: "e1", email: "a@x.pt", phone: null }])));
    const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    let organizacao = "org-1";
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <FontePessoasContext.Provider value={real(organizacao)}>{children}</FontePessoasContext.Provider>
      </QueryClientProvider>
    );
    const { result, rerender } = renderHook(({ lista }) => useContactosPessoas(lista, true), { wrapper, initialProps: { lista: ["e1"] } });
    await waitFor(() => expect(result.current.get("e1")?.email).toBe("a@x.pt"));
    organizacao = "org-2";
    rerender({ lista: ["e2"] });
    await waitFor(() => expect(pedidos).toHaveLength(2));
    expect(result.current.size).toBe(0);
  });
});
