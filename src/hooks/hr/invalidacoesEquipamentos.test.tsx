// O equipamento da pessoa e um ativo, e o custo, os livres e as ocupacoes vivem em consultas diferentes (cache de 5 minutos). Qualquer escrita
// do RH ou dos Ativos que mude quem tem o que, ou o valor, tem de as refazer; senão devolve-se o portátil da Ana e ele não aparece livre ao Bruno.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const m = vi.hoisted(() => ({ rpc: vi.fn(), captura: vi.fn() }));
vi.mock("@/lib/hr/hrDb", () => ({ hrRpc: (...a: unknown[]) => m.rpc(...a) }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" } }) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...a: unknown[]) => m.captura(...a) }));

import { contaUmaVez } from "@/components/rh-exemplo/lib/comoConta";
import type { EquipamentoPessoa } from "@/components/rh-exemplo/lib/equipamentos";
import { useAtivoMutacoes } from "@/hooks/ativos/useAtivoMutacoes";
import { useEquipamentosCustoAcoes } from "./useEquipamentosCusto";
import { useOcupacoesDoAtivo } from "./useEquipamentosLivres";

const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const envolver = ({ children }: { children: ReactNode }) => <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;

const EQUIPAMENTO: EquipamentoPessoa = {
  id: "e1", pessoaId: "p1", tipo: "portatil", descricao: "Portátil", valor: 1200, entrega: "2026-01-10", conta: contaUmaVez(), estado: "atribuido",
  devolucao: null, estadoDevolucao: null, autor: "",
};

/** As chaves (primeiro elemento) que foram invalidadas. */
const invalidadas = (espia: ReturnType<typeof vi.spyOn>): string[] =>
  espia.mock.calls.map((c) => String(((c[0] as { queryKey?: unknown[] } | undefined)?.queryKey ?? [])[0]));

// A lista «por devolver» (Saidas, faixas, aviso do Terminar) vive na mesma cache de 5 minutos: devolver ou entregar muda-a.
const TODAS = ["hr-custo-equipamentos", "hr-equipamentos-livres", "hr-ocupacoes-ativo", "ativos-por-devolver"];

beforeEach(() => {
  vi.restoreAllMocks();
  m.rpc.mockReset();
  m.captura.mockReset();
  cliente.clear();
});

describe("o RH refaz os livres e as ocupacoes depois de escrever", () => {
  it("devolver: o equipamento volta a estar livre, por isso refaz o custo, os livres, as ocupacoes e os Ativos", async () => {
    m.rpc.mockResolvedValue({ data: {}, error: null });
    const espia = vi.spyOn(cliente, "invalidateQueries");
    const { result } = renderHook(() => useEquipamentosCustoAcoes(), { wrapper: envolver });
    let r: { ok: boolean } | undefined;
    await act(async () => { r = await result.current.devolver(EQUIPAMENTO, "2026-02-10", "bom"); });
    expect(r?.ok).toBe(true);
    expect(invalidadas(espia)).toEqual(expect.arrayContaining([...TODAS, "ativos"]));
  });

  it("atribuir (por exemplo um ativo livre): refaz os livres, para ele deixar de ser oferecido", async () => {
    m.rpc.mockResolvedValue({ data: { id: "novo" }, error: null });
    const espia = vi.spyOn(cliente, "invalidateQueries");
    const { result } = renderHook(() => useEquipamentosCustoAcoes(), { wrapper: envolver });
    await act(async () => {
      await result.current.atribuir({ forma: "existente", pessoaId: "p1", ativoId: "a1", entrega: "2026-02-10" } as never);
    });
    expect(invalidadas(espia)).toEqual(expect.arrayContaining(TODAS));
  });
});

describe("os Ativos refazem o custo do RH, os livres e as ocupacoes depois de escrever", () => {
  it.each([
    ["criar", (a: ReturnType<typeof useAtivoMutacoes>) => a.criar("pessoa", { p_nome: "Portátil" })],
    ["alterar", (a: ReturnType<typeof useAtivoMutacoes>) => a.alterar("a1", { p_nome: "Portátil" })],
    ["desativar", (a: ReturnType<typeof useAtivoMutacoes>) => a.desativar("a1", { data: "2026-02-10", motivo: "vendido", nota: null })],
    ["reativar", (a: ReturnType<typeof useAtivoMutacoes>) => a.reativar("a1")],
  ])("%s", async (_nome, escrever) => {
    m.rpc.mockResolvedValue({ data: { id: "a1" }, error: null });
    const espia = vi.spyOn(cliente, "invalidateQueries");
    const { result } = renderHook(() => useAtivoMutacoes(), { wrapper: envolver });
    let r: { ok: boolean } | undefined;
    await act(async () => { r = await escrever(result.current); });
    expect(r?.ok).toBe(true);
    expect(invalidadas(espia)).toEqual(expect.arrayContaining(["ativos", ...TODAS]));
  });
});

describe("useOcupacoesDoAtivo: so a recusa por permissao fica em silencio", () => {
  it.each([
    [{ code: "42501", message: "insufficient_privilege" }],
    [{ code: "PGRST202", message: "Could not find the function" }],
  ])("recusa ou RPC por aplicar (%j): sem numero e sem registo de erro", async (erro) => {
    m.rpc.mockResolvedValue({ data: null, error: erro });
    const { result } = renderHook(() => useOcupacoesDoAtivo("a1", true), { wrapper: envolver });
    await waitFor(() => expect(m.rpc).toHaveBeenCalled());
    await waitFor(() => expect(result.current.aCarregar).toBe(false));
    expect(result.current.pessoas).toBeNull();
    expect(m.captura).not.toHaveBeenCalled();
  });

  it("um defeito (falha de rede, erro da RPC) vai para o registo de erros e o aviso fica sem numero", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    const { result } = renderHook(() => useOcupacoesDoAtivo("a1", true), { wrapper: envolver });
    await waitFor(() => expect(m.captura).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.aCarregar).toBe(false));
    expect(result.current.pessoas).toBeNull();
  });
});
