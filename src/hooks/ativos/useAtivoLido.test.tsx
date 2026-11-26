// A ficha de um ativo lê-o por `rpc_ativo_ler` (ocupações com o nome da pessoa) e o valor do armazém por `inv_valor_stock_armazens`. Os dois são
// tolerantes: uma recusa não é um defeito, o ecrã só deixa de mostrar o que não pôde ler.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const m = vi.hoisted(() => ({ rpc: vi.fn(), captura: vi.fn(), valorStock: vi.fn() }));
vi.mock("@/lib/hr/hrDb", () => ({ hrRpc: (...a: unknown[]) => m.rpc(...a) }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" } }) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...a: unknown[]) => m.captura(...a) }));
vi.mock("@/lib/custosStock", () => ({ valorStockPorArmazem: (...a: unknown[]) => m.valorStock(...a) }));

import { useAtivoLido } from "./useAtivoLido";
import { useValorStockArmazem } from "./useValorStockArmazem";

const envolver = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

const LIDO = {
  id: "a1", grupo: "pessoa", tipo: "portatil", nome: "Portátil", codigo: "POR-0001", data_compra: "2027-01-05", valor_compra: 1200, valor_residual: 0, vida_meses: 36,
  manutencao_ano: 0, estado: "ativo", forma_aquisicao: "comprado", vida_origem: "pagamento", ligado: true,
  atribuicao: { pessoa_equipamento_id: "o2", pessoa_nome: "Bruno", entrega: "2028-03-15" },
  ocupacoes: [
    { pessoa_equipamento_id: "o1", pessoa_id: "p1", pessoa_nome: "Ana", entrega: "2027-01-10", devolucao: "2028-01-10", estado: "devolvido", conta_desde: "2027-01-10" },
    { pessoa_equipamento_id: "o2", pessoa_id: "p2", pessoa_nome: "Bruno", entrega: "2028-03-15", devolucao: null, estado: "atribuido", conta_desde: "2028-03-15" },
  ],
};

beforeEach(() => {
  m.rpc.mockReset();
  m.captura.mockReset();
  m.valorStock.mockReset();
});

describe("useAtivoLido", () => {
  it("chama rpc_ativo_ler com o id e a organização e devolve as ocupações com o nome", async () => {
    m.rpc.mockResolvedValue({ data: LIDO, error: null });
    const { result } = renderHook(() => useAtivoLido("a1", true), { wrapper: envolver });
    await waitFor(() => expect(result.current.ativo).not.toBeNull());
    expect(m.rpc).toHaveBeenCalledWith("rpc_ativo_ler", { p_id: "a1", p_organization_id: "org-1" });
    expect(result.current.ativo!.ocupacoes.map((o) => [o.pessoaNome, o.estado, o.devolucao])).toEqual([["Ana", "devolvido", "2028-01-10"], ["Bruno", "atribuido", null]]);
    expect(result.current.ativo!.ligado).toBe(true);
  });

  it("desligado (sem ficha aberta) não chama a base", () => {
    renderHook(() => useAtivoLido("a1", false), { wrapper: envolver });
    renderHook(() => useAtivoLido(null, true), { wrapper: envolver });
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "42501", message: "insufficient_privilege" }],
    [{ code: "PGRST202", message: "Could not find the function" }],
  ])("recusa ou RPC por aplicar (%j): sem ativo e sem registo de erro (a ficha fica com os dados da lista)", async (erro) => {
    m.rpc.mockResolvedValue({ data: null, error: erro });
    const { result } = renderHook(() => useAtivoLido("a1", true), { wrapper: envolver });
    await waitFor(() => expect(m.rpc).toHaveBeenCalled());
    await waitFor(() => expect(result.current.aCarregar).toBe(false));
    expect(result.current.ativo).toBeNull();
    expect(result.current.falhou).toBe(false);
    expect(m.captura).not.toHaveBeenCalled();
  });

  it("um defeito também devolve null, vai para o registo de erros e marca a leitura como falhada", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    const { result } = renderHook(() => useAtivoLido("a1", true), { wrapper: envolver });
    await waitFor(() => expect(m.captura).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.falhou).toBe(true));
    expect(result.current.ativo).toBeNull();
  });
});

describe("useValorStockArmazem", () => {
  it("lê o valor de todos os armazéns numa chamada e devolve o do armazém ligado", async () => {
    m.valorStock.mockResolvedValue({ w1: 12345.6, w2: 10 });
    const { result } = renderHook(() => useValorStockArmazem("w1", true), { wrapper: envolver });
    await waitFor(() => expect(result.current.valor).toBe(12345.6));
    expect(m.valorStock).toHaveBeenCalledWith("org-1");
  });

  it("um armazém sem stock vale 0", async () => {
    m.valorStock.mockResolvedValue({ w2: 10 });
    const { result } = renderHook(() => useValorStockArmazem("w1", true), { wrapper: envolver });
    await waitFor(() => expect(result.current.valor).toBe(0));
  });

  it("sem permissão (ligado = false) ou sem armazém não pede nada", () => {
    renderHook(() => useValorStockArmazem("w1", false), { wrapper: envolver });
    renderHook(() => useValorStockArmazem(null, true), { wrapper: envolver });
    expect(m.valorStock).not.toHaveBeenCalled();
  });

  it("uma recusa não é um defeito: falhou, sem valor e sem registo de erro", async () => {
    m.valorStock.mockRejectedValue({ code: "42501", message: "insufficient_privilege" });
    const { result } = renderHook(() => useValorStockArmazem("w1", true), { wrapper: envolver });
    await waitFor(() => expect(result.current.falhou).toBe(true));
    expect(result.current.valor).toBeNull();
    expect(m.captura).not.toHaveBeenCalled();
  });

  it("um defeito vai para o registo de erros", async () => {
    m.valorStock.mockRejectedValue({ code: "XX000", message: "boom" });
    const { result } = renderHook(() => useValorStockArmazem("w1", true), { wrapper: envolver });
    await waitFor(() => expect(result.current.falhou).toBe(true));
    expect(m.captura).toHaveBeenCalledTimes(1);
  });
});
