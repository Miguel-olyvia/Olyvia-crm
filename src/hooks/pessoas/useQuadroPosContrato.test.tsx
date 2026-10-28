import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { FontePessoasContext, type FontePessoas } from "./useFontePessoas";
import { quadroPessoasQueryKey } from "./useQuadroPessoas";
import type { FiltrosQuadro } from "./quadroPessoasTipos";
import { linhaNegocio } from "./quadroPessoasTestUtil";
import { useQuadroPosContrato } from "./useQuadroPosContrato";

const rpcMock = vi.fn();
const captureMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpcMock(...a) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...a: unknown[]) => captureMock(...a) }));

const FILTROS: FiltrosQuadro = { papel: null, pesquisa: "", ordem: "recentes" };
let fonte: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: null };

const ok = (linhas: unknown[] | null) => Promise.resolve({ data: linhas, error: null });
const falha = (code: string) => Promise.resolve({ data: null, error: { code, message: "x" } });
const params = (n: number) => rpcMock.mock.calls[n][1] as Record<string, unknown>;

function montar(filtros: FiltrosQuadro = FILTROS, ativo = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <FontePessoasContext.Provider value={fonte}>{children}</FontePessoasContext.Provider>
    </QueryClientProvider>
  );
  return { client, ...renderHook((p: { f: FiltrosQuadro; ativo: boolean }) => useQuadroPosContrato(p.f, p.ativo), { wrapper, initialProps: { f: filtros, ativo } }) };
}

const primeira = () => [
  linhaNegocio("f1", "financeiro", { valor: 100, total_coluna: "30", valor_coluna: "4000.5", ha_mais: true, chave_ordem: "K-f1" }),
  linhaNegocio("f2", "financeiro", { valor: "50", total_coluna: "30", valor_coluna: "4000.5", ha_mais: true, chave_ordem: "K-f2" }),
  linhaNegocio("o1", "obra", { valor: 700, total_coluna: 1, valor_coluna: 700, ha_mais: false, chave_ordem: "K-o1" }),
];

beforeEach(() => {
  rpcMock.mockReset();
  captureMock.mockReset();
  fonte = { modo: "real", organizationId: "org-1", momentoGanho: null };
});

describe("useQuadroPosContrato: o pedido", () => {
  it("uma só chamada com os 8 parâmetros: só as colunas financeiro e obra, nada de gravação", async () => {
    rpcMock.mockReturnValue(ok([]));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][0]).toBe("neg_resumo_quadro");
    expect(params(0)).toEqual({
      p_organization_id: "org-1", p_colunas: ["financeiro", "obra"], p_papel: null, p_pesquisa: null, p_ordem: "recentes",
      p_depois_de_chave: null, p_depois_de_id: null, p_limite: 25,
    });
  });

  it("leva o papel e a ordem e apara a pesquisa, como o Quadro principal", async () => {
    rpcMock.mockReturnValue(ok([]));
    const { result } = montar({ papel: "cliente", pesquisa: "  Ana ", ordem: "nome" });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(params(0)).toMatchObject({ p_papel: "cliente", p_pesquisa: "Ana", p_ordem: "nome" });
  });

  it("não consulta no modo exemplo nem desativado", async () => {
    fonte = { modo: "exemplo" };
    const a = montar();
    await act(async () => { await Promise.resolve(); });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(a.result.current.cartoes).toEqual([]);
    fonte = { modo: "real", organizationId: "org-1", momentoGanho: null };
    montar(FILTROS, false);
    await act(async () => { await Promise.resolve(); });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("useQuadroPosContrato: o resultado", () => {
  it("agrupa por coluna, com os totais da coluna inteira e o valor (texto numérico incluído)", async () => {
    rpcMock.mockReturnValue(ok(primeira()));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const { financeiro, obra } = result.current.colunas;
    expect(financeiro.cartoes.map((c) => c.id)).toEqual(["f1", "f2"]);
    expect(financeiro).toMatchObject({ total: 30, valor: 4000.5, haMais: true, cursor: { chave: "K-f2", id: "f2" } });
    expect(obra).toMatchObject({ total: 1, valor: 700, haMais: false });
    expect(result.current.cartoes.map((c) => c.id)).toEqual(["f1", "f2", "o1"]);
    expect(result.current.indisponivel).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it("sem linhas: duas colunas vazias com total 0 e sem aviso de indisponível", async () => {
    rpcMock.mockReturnValue(ok(null));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.colunas.financeiro).toMatchObject({ cartoes: [], total: 0, valor: 0, haMais: false });
    expect(result.current.colunas.obra).toMatchObject({ cartoes: [], total: 0, valor: 0, haMais: false });
    expect(result.current.indisponivel).toBe(false);
  });

  it("descarta linhas de colunas que não são do pós-contrato", async () => {
    rpcMock.mockReturnValue(ok([linhaNegocio("x", "contrato"), linhaNegocio("o1", "obra")]));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.cartoes.map((c) => c.id)).toEqual(["o1"]);
  });
});

describe("useQuadroPosContrato: base ainda sem as colunas (versão antiga da função)", () => {
  it("NG009 não é erro: diz que está indisponível, devolve colunas vazias e não repete o pedido", async () => {
    rpcMock.mockReturnValue(falha("NG009"));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.indisponivel).toBe(true);
    expect(result.current.isError).toBe(false);
    expect(result.current.cartoes).toEqual([]);
    expect(result.current.colunas.obra.total).toBe(0);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("outro erro com código (sem permissão) é erro e não «indisponível»", async () => {
    rpcMock.mockReturnValue(falha("42501"));
    const { result } = montar();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.indisponivel).toBe(false);
    expect(result.current.erro?.codigo).toBe("42501");
  });

  it("«recarregar» volta a pedir e, se a base já conhece as colunas, o aviso desaparece", async () => {
    rpcMock.mockReturnValueOnce(falha("NG009"));
    const { result } = montar();
    await waitFor(() => expect(result.current.indisponivel).toBe(true));
    rpcMock.mockReturnValue(ok(primeira()));
    act(() => result.current.recarregar());
    await waitFor(() => expect(result.current.indisponivel).toBe(false));
    expect(result.current.cartoes).toHaveLength(3);
  });
});

describe("useQuadroPosContrato: carregar mais", () => {
  it("pede só a coluna com o cursor dela e acrescenta sem repetir", async () => {
    rpcMock.mockReturnValueOnce(ok(primeira()));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rpcMock.mockReturnValueOnce(ok([
      linhaNegocio("f2", "financeiro", { total_coluna: 30, valor_coluna: 4000.5, ha_mais: false, chave_ordem: "K-f2" }),
      linhaNegocio("f3", "financeiro", { total_coluna: 30, valor_coluna: 4000.5, ha_mais: false, chave_ordem: "K-f3" }),
    ]));
    let saiu = false;
    act(() => { saiu = result.current.carregarMais("financeiro"); });
    expect(saiu).toBe(true);
    await waitFor(() => expect(result.current.aCarregarMais.size).toBe(0));
    expect(params(1)).toMatchObject({ p_colunas: ["financeiro"], p_depois_de_chave: "K-f2", p_depois_de_id: "f2", p_limite: 25 });
    expect(result.current.colunas.financeiro.cartoes.map((c) => c.id)).toEqual(["f1", "f2", "f3"]);
    expect(result.current.colunas.financeiro.haMais).toBe(false);
    expect(result.current.colunas.obra.cartoes.map((c) => c.id)).toEqual(["o1"]);
  });

  it("sem mais por pedir não chama a base", async () => {
    rpcMock.mockReturnValue(ok(primeira()));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let saiu = true;
    act(() => { saiu = result.current.carregarMais("obra"); });
    expect(saiu).toBe(false);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("dois cliques seguidos pedem uma só vez", async () => {
    rpcMock.mockReturnValueOnce(ok(primeira()));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rpcMock.mockReturnValue(new Promise(() => undefined));
    act(() => { result.current.carregarMais("financeiro"); result.current.carregarMais("financeiro"); });
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it("uma falha fica na coluna, os cartões carregados ficam, e repetir limpa o erro", async () => {
    rpcMock.mockReturnValueOnce(ok(primeira()));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rpcMock.mockReturnValueOnce(falha("42501"));
    act(() => { result.current.carregarMais("financeiro"); });
    await waitFor(() => expect(result.current.errosAoCarregarMais.financeiro).toBeDefined());
    expect(result.current.colunas.financeiro.cartoes).toHaveLength(2);
    expect(result.current.errosAoCarregarMais.obra).toBeUndefined();
    rpcMock.mockReturnValueOnce(ok([linhaNegocio("f3", "financeiro", { total_coluna: 30, ha_mais: false, chave_ordem: "K-f3" })]));
    act(() => { result.current.carregarMais("financeiro"); });
    await waitFor(() => expect(result.current.errosAoCarregarMais.financeiro).toBeUndefined());
    await waitFor(() => expect(result.current.colunas.financeiro.cartoes).toHaveLength(3));
  });

  it("uma resposta que rebenta ao tratar-se (linha malformada) acaba em erro na coluna e sai de «a carregar» (nada fica preso)", async () => {
    rpcMock.mockReturnValueOnce(ok(primeira()));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rpcMock.mockReturnValueOnce(ok([null]));
    act(() => { result.current.carregarMais("financeiro"); });
    await waitFor(() => expect(result.current.aCarregarMais.size).toBe(0));
    expect(result.current.errosAoCarregarMais.financeiro).toBeDefined();
    expect(result.current.colunas.financeiro.cartoes).toHaveLength(2);
  });

  it("ha_mais sem cursor é contrato partido: devolve false, mostra o erro e regista-o", async () => {
    rpcMock.mockReturnValueOnce(ok([linhaNegocio("f1", "financeiro", { ha_mais: true, chave_ordem: null, total_coluna: 9 })]));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let saiu = true;
    act(() => { saiu = result.current.carregarMais("financeiro"); });
    expect(saiu).toBe(false);
    expect(captureMock).toHaveBeenCalled();
    expect(result.current.errosAoCarregarMais.financeiro).toBeDefined();
  });
});

describe("useQuadroPosContrato: cache", () => {
  it("a chave fica debaixo da do Quadro: invalidar o Quadro refaz também estas colunas", async () => {
    rpcMock.mockReturnValue(ok(primeira()));
    const { result, client } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(rpcMock).toHaveBeenCalledTimes(1);
    await act(async () => { await client.invalidateQueries({ queryKey: quadroPessoasQueryKey("org-1") }); });
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it("não se mistura com a consulta do Quadro principal (chave distinta)", async () => {
    rpcMock.mockReturnValue(ok([]));
    const { client, result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const chaves = client.getQueryCache().getAll().map((q) => JSON.stringify(q.queryKey));
    expect(chaves).toHaveLength(1);
    expect(chaves[0]).toContain("posContrato");
  });
});
