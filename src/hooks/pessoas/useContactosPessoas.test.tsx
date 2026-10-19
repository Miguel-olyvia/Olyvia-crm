// Telefone e email das linhas visíveis, pela mesma via que a página de Leads: dois pedidos diretos (emails e telefones principais)
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

interface Pedido { tabela: string; colunas: string; filtroIn: [string, string[]]; filtroEq: [string, unknown] }
const pedidos: Pedido[] = [];
type Respondedor = (p: Pedido) => Resp | Promise<Resp>;

/** Simula supabase.from(tabela).select(colunas).in(col, ids).eq(col, valor), como em AnewLeads. */
function simular(responder: Respondedor) {
  pedidos.length = 0;
  fromMock.mockImplementation((tabela: string) => ({
    select: (colunas: string) => ({
      in: (col: string, idsIn: string[]) => ({
        eq: (colEq: string, valor: unknown) => {
          const p: Pedido = { tabela, colunas, filtroIn: [col, idsIn], filtroEq: [colEq, valor] };
          pedidos.push(p);
          return Promise.resolve(responder(p));
        },
      }),
    }),
  }));
}
const porTabela = (emails: Resp, telefones: Resp): Respondedor => (p) => (p.tabela === "anew_entity_emails" ? emails : telefones);
const idsDe = (tabela: string): string[][] => pedidos.filter((p) => p.tabela === tabela).map((p) => p.filtroIn[1]);

describe("useContactosPessoas", () => {
  beforeEach(() => { fromMock.mockReset(); captureMock.mockReset(); pedidos.length = 0; });

  it("sem ids não faz pedido nenhum", async () => {
    simular(porTabela(ok([]), ok([])));
    const { wrapper } = montar();
    const { result } = renderHook(() => useContactosPessoas([], true), { wrapper });
    await Promise.resolve();
    expect(fromMock).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  it("desligado (colunas escondidas) não faz pedido", async () => {
    simular(porTabela(ok([]), ok([])));
    const { wrapper } = montar();
    renderHook(() => useContactosPessoas(ids(3), false), { wrapper });
    await Promise.resolve();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("em modo exemplo (sem organização) não faz pedido", async () => {
    simular(porTabela(ok([]), ok([])));
    const { wrapper } = montar({ modo: "exemplo" });
    renderHook(() => useContactosPessoas(ids(3), true), { wrapper });
    await Promise.resolve();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("uma página são DOIS pedidos como em Leads: .in(entity_id) com is_primary = true, emails e telefones, sem repetidos", async () => {
    simular(porTabela(ok([]), ok([])));
    const { wrapper } = montar();
    renderHook(() => useContactosPessoas([...ids(100), "e0", "e5"], true), { wrapper });
    await waitFor(() => expect(pedidos).toHaveLength(2));
    const email = pedidos.find((p) => p.tabela === "anew_entity_emails");
    const telefone = pedidos.find((p) => p.tabela === "anew_entity_phones");
    expect(email).toMatchObject({ colunas: "entity_id, email", filtroEq: ["is_primary", true] });
    expect(telefone).toMatchObject({ colunas: "entity_id, phone_number", filtroEq: ["is_primary", true] });
    expect(email?.filtroIn[0]).toBe("entity_id");
    expect(telefone?.filtroIn[0]).toBe("entity_id");
    expect(email?.filtroIn[1]).toHaveLength(100);
    expect(telefone?.filtroIn[1]).toHaveLength(100);
  });

  it("150 ids são dois lotes (100 e 50), cada um com um pedido de emails e outro de telefones: o custo cresce por página, não por linha", async () => {
    simular(porTabela(ok([]), ok([])));
    const { wrapper } = montar();
    renderHook(() => useContactosPessoas(ids(150), true), { wrapper });
    await waitFor(() => expect(pedidos).toHaveLength(4));
    for (const tabela of ["anew_entity_emails", "anew_entity_phones"]) {
      expect(idsDe(tabela).map((l) => l.length).sort((a, b) => a - b)).toEqual([50, 100]);
    }
  });

  it("devolve telefone e email por pessoa; entidades sem contacto, e valores vazios, ficam a null", async () => {
    simular(porTabela(
      ok([{ entity_id: "e0", email: "a@x.pt" }, { entity_id: "e1", email: "  " }]),
      ok([{ entity_id: "e0", phone_number: " 912345678 " }]),
    ));
    const { wrapper } = montar();
    const { result } = renderHook(() => useContactosPessoas(["e0", "e1", "e2"], true), { wrapper });
    await waitFor(() => expect(result.current.size).toBe(3));
    expect(result.current.get("e0")).toEqual({ telefone: "912345678", email: "a@x.pt" });
    expect(result.current.get("e1")).toEqual({ telefone: null, email: null });
    expect(result.current.get("e2")).toEqual({ telefone: null, email: null });
  });

  it("quem tem telefone mas não email (e o contrário) fica só com o que tem", async () => {
    simular(porTabela(ok([{ entity_id: "e1", email: "b@x.pt" }]), ok([{ entity_id: "e0", phone_number: "911111111" }])));
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
    expect(pedidos).toHaveLength(2);
  });

  it("um erro num dos dois pedidos não deixa a pessoa com valor falso: fica por saber e o erro é reportado", async () => {
    simular(porTabela(ok([{ entity_id: "e0", email: "a@x.pt" }]), { data: null, error: { code: "57014", message: "timeout" } }));
    const { wrapper } = montar();
    const { result } = renderHook(() => useContactosPessoas(["e0"], true), { wrapper });
    await waitFor(() => expect(captureMock).toHaveBeenCalledWith(expect.objectContaining({ code: "57014" }), "pessoas-neg"));
    expect(result.current.has("e0")).toBe(false);
  });

  it("o erro no pedido dos emails também deixa o lote por saber", async () => {
    simular(porTabela({ data: null, error: { code: "42501", message: "negado" } }, ok([{ entity_id: "e0", phone_number: "912345678" }])));
    const { wrapper } = montar();
    const { result } = renderHook(() => useContactosPessoas(["e0"], true), { wrapper });
    await waitFor(() => expect(captureMock).toHaveBeenCalledWith(expect.objectContaining({ code: "42501" }), "pessoas-neg"));
    expect(result.current.has("e0")).toBe(false);
  });

  it("um lote que falha não bloqueia os outros", async () => {
    simular((p) => (p.filtroIn[1].includes("e0")
      ? { data: null, error: { code: "57014", message: "timeout" } }
      : ok(p.tabela === "anew_entity_emails" ? [{ entity_id: "e100", email: "z@x.pt" }] : [])));
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
    simular(porTabela(ok([]), ok([])));
    const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    const a = renderHook(() => useContactosPessoas(["e0"], true), { wrapper: montar(real("org-1"), client).wrapper });
    await waitFor(() => expect(pedidos).toHaveLength(2));
    a.unmount();
    renderHook(() => useContactosPessoas(["e0"], true), { wrapper: montar(real("org-2"), client).wrapper });
    await waitFor(() => expect(pedidos).toHaveLength(4));
  });
});
