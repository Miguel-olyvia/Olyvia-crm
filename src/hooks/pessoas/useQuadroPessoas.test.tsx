import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { FontePessoasContext, type FontePessoas } from "./useFontePessoas";
import { listaPessoasQueryKey } from "./useListaPessoas";
import { quadroPessoasQueryKey, useQuadroPessoas } from "./useQuadroPessoas";
import type { FiltrosQuadro } from "./quadroPessoasTipos";
import { linhaNegocio, linhaQuadro } from "./quadroPessoasTestUtil";

const rpcMock = vi.fn();
const captureMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpcMock(...a) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...a: unknown[]) => captureMock(...a) }));

const FILTROS: FiltrosQuadro = { papel: null, pesquisa: "", ordem: "recentes" };
const real = (organizationId: string): FontePessoas => ({ modo: "real", organizationId, momentoGanho: null });
let fonte: FontePessoas = real("org-1");

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
  return { client, ...renderHook((p: { f: FiltrosQuadro; ativo: boolean }) => useQuadroPessoas(p.f, p.ativo), { wrapper, initialProps: { f: filtros, ativo } }) };
}

// Uma coluna «orcamento» com duas linhas e mais por carregar, e uma «porContactar» completa.
const primeiraChamada = () => [
  linhaQuadro("p1", { total_coluna: 1, valor_coluna: null }),
  linhaNegocio("n1", "orcamento", { n_orcamentos: 1, valor: "100", total_coluna: "30", valor_coluna: "4000.5", ha_mais: true, chave_ordem: "K-n1" }),
  linhaNegocio("n2", "orcamento", { n_orcamentos: 1, valor: 50, total_coluna: "30", valor_coluna: "4000.5", ha_mais: true, chave_ordem: "K-n2" }),
];

beforeEach(() => {
  rpcMock.mockReset();
  captureMock.mockReset();
  fonte = real("org-1");
});

describe("useQuadroPessoas: a primeira chamada", () => {
  it("envia os 8 parâmetros exatos, com null explícito", async () => {
    rpcMock.mockReturnValue(ok([]));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][0]).toBe("neg_resumo_quadro");
    expect(params(0)).toEqual({
      p_organization_id: "org-1", p_colunas: null, p_papel: null, p_pesquisa: null, p_ordem: "recentes",
      p_depois_de_chave: null, p_depois_de_id: null, p_limite: 25,
    });
  });

  it("leva o papel e a ordem, e apara a pesquisa", async () => {
    rpcMock.mockReturnValue(ok([]));
    const { result } = montar({ papel: "cliente", pesquisa: "  Ana ", ordem: "nome" });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(params(0)).toMatchObject({ p_papel: "cliente", p_pesquisa: "Ana", p_ordem: "nome" });
  });

  it("pesquisa de menos de 2 letras (depois de aparada) não vai", async () => {
    rpcMock.mockReturnValue(ok([]));
    const { result } = montar({ ...FILTROS, pesquisa: " a " });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(params(0).p_pesquisa).toBeNull();
  });

  it("não consulta no modo exemplo nem desligado", async () => {
    fonte = { modo: "exemplo" };
    const a = montar();
    await act(async () => { await Promise.resolve(); });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(a.result.current.cartoes).toEqual([]);
    fonte = real("org-1");
    montar(FILTROS, false);
    await act(async () => { await Promise.resolve(); });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("devolve as 7 colunas, com totais e valor da coluna inteira; valor_coluna NULL conta como 0; sem linhas, total 0", async () => {
    rpcMock.mockReturnValue(ok(primeiraChamada()));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const c = result.current.colunas;
    expect(Object.keys(c)).toEqual(["porContactar", "contactado", "visita", "levantamento", "orcamento", "proposta", "contrato"]);
    expect(c.porContactar).toMatchObject({ total: 1, valor: 0, haMais: false });
    expect(c.orcamento).toMatchObject({ total: 30, valor: 4000.5, haMais: true });
    expect(c.orcamento.cartoes.map((x) => x.id)).toEqual(["n1", "n2"]);
    expect(c.orcamento.cursor).toEqual({ chave: "K-n2", id: "n2" });
    expect(c.contrato).toEqual({ cartoes: [], cursor: null, haMais: false, total: 0, valor: 0 });
    expect(result.current.cartoes).toHaveLength(3);
  });

  it("resposta null conta como lista vazia", async () => {
    rpcMock.mockReturnValue(ok(null));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.cartoes).toEqual([]);
    expect(result.current.isError).toBe(false);
  });

  it("descarta uma linha de coluna desconhecida sem rebentar", async () => {
    rpcMock.mockReturnValue(ok([linhaQuadro("x", { coluna: "arquivo" }), linhaQuadro("y")]));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.cartoes.map((c) => c.id)).toEqual(["y"]);
  });

  it("descarta uma linha de pessoa: o quadro só tem negócios", async () => {
    rpcMock.mockReturnValue(ok([linhaQuadro("p", { tipo: "pessoa" }), linhaQuadro("n")]));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.cartoes.map((c) => [c.id, c.tipo])).toEqual([["n", "negocio"]]);
  });
});

describe("useQuadroPessoas: a chave da cache", () => {
  it("leva a organização, parte do prefixo da Lista (a invalidação da Lista invalida o Quadro) e não depende de espaços na pesquisa", () => {
    const k = quadroPessoasQueryKey("org-1", { papel: null, pesquisa: " Ana ", ordem: "recentes" });
    expect(k.slice(0, 2)).toEqual(listaPessoasQueryKey("org-1"));
    expect(k).toEqual(quadroPessoasQueryKey("org-1", { papel: null, pesquisa: "Ana", ordem: "recentes" }));
    expect(k).toEqual(quadroPessoasQueryKey("org-1", { papel: null, pesquisa: "Ana ", ordem: "recentes" }));
    expect(k).not.toEqual(quadroPessoasQueryKey("org-2", { papel: null, pesquisa: "Ana", ordem: "recentes" }));
    expect(quadroPessoasQueryKey("org-1", { papel: null, pesquisa: "a", ordem: "recentes" }))
      .toEqual(quadroPessoasQueryKey("org-1", { papel: null, pesquisa: "", ordem: "recentes" }));
  });

  it("pesquisas equivalentes partilham a cache: a segunda montagem não repete o pedido", async () => {
    rpcMock.mockReturnValue(ok([]));
    const a = montar({ ...FILTROS, pesquisa: "Ana" });
    await waitFor(() => expect(a.result.current.isLoading).toBe(false));
    a.rerender({ f: { ...FILTROS, pesquisa: "Ana " }, ativo: true });
    await act(async () => { await Promise.resolve(); });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("invalidar o prefixo da Lista refaz o Quadro", async () => {
    rpcMock.mockReturnValue(ok([]));
    const { result, client } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await client.invalidateQueries({ queryKey: listaPessoasQueryKey("org-1") }); });
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });
});

describe("useQuadroPessoas: erros", () => {
  it.each(["NG009", "42501", "57014"])("o erro %s não se repete e vem traduzido", async (code) => {
    rpcMock.mockReturnValue(falha(code));
    const { result } = montar();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(result.current.erroSemDados).toBe(true);
    expect(result.current.erro?.chave).toBeTruthy();
  });

  it("um erro de rede repete no máximo 2 vezes", async () => {
    rpcMock.mockReturnValue(falha("08006"));
    const { result } = montar();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rpcMock).toHaveBeenCalledTimes(3);
  });

  it("recarregar depois de um erro volta a pedir", async () => {
    rpcMock.mockReturnValueOnce(falha("NG009")).mockReturnValue(ok([linhaQuadro("a")]));
    const { result } = montar();
    await waitFor(() => expect(result.current.isError).toBe(true));
    act(() => result.current.recarregar());
    await waitFor(() => expect(result.current.cartoes).toHaveLength(1));
    expect(result.current.isError).toBe(false);
  });
});

describe("useQuadroPessoas: carregar mais por coluna", () => {
  it("pede só aquela coluna com o cursor cru, junta sem duplicar, atualiza o rodapé e não mexe nas outras", async () => {
    rpcMock.mockReturnValueOnce(ok(primeiraChamada()));
    const { result } = montar({ papel: "lead", pesquisa: "Ana", ordem: "nome" });
    await waitFor(() => expect(result.current.colunas.orcamento.haMais).toBe(true));
    const antes = result.current.colunas;
    const antesLista = antes.orcamento.cartoes;
    rpcMock.mockReturnValueOnce(ok([
      linhaNegocio("n2", "orcamento", { n_orcamentos: 1, total_coluna: 30, valor_coluna: 4100, ha_mais: false, chave_ordem: "K-n2" }),
      linhaNegocio("n3", "orcamento", { n_orcamentos: 1, valor: 7, total_coluna: 30, valor_coluna: 4100, ha_mais: false, chave_ordem: "K-n3" }),
    ]));
    act(() => result.current.carregarMais("orcamento"));
    await waitFor(() => expect(result.current.colunas.orcamento.cartoes).toHaveLength(3));
    expect(params(1)).toEqual({
      p_organization_id: "org-1", p_colunas: ["orcamento"], p_papel: "lead", p_pesquisa: "Ana", p_ordem: "nome",
      p_depois_de_chave: "K-n2", p_depois_de_id: "n2", p_limite: 25,
    });
    const c = result.current.colunas;
    expect(c.orcamento.cartoes.map((x) => x.id)).toEqual(["n1", "n2", "n3"]);
    expect(c.orcamento).toMatchObject({ haMais: false, valor: 4100, total: 30, cursor: { chave: "K-n3", id: "n3" } });
    expect(c.porContactar).toBe(antes.porContactar);
    // Nada foi mutado: a lista anterior continua com 2 cartões.
    expect(antesLista).toHaveLength(2);
    expect(result.current.aCarregarMais.has("orcamento")).toBe(false);
  });

  it("o cursor de um cartão de pessoa é o entity_id sem prefixo", async () => {
    rpcMock.mockReturnValueOnce(ok([linhaQuadro("p1", { ha_mais: true, chave_ordem: "K1", total_coluna: 40 })]));
    const { result } = montar();
    await waitFor(() => expect(result.current.colunas.porContactar.haMais).toBe(true));
    rpcMock.mockReturnValueOnce(ok([]));
    act(() => result.current.carregarMais("porContactar"));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(params(1)).toMatchObject({ p_colunas: ["porContactar"], p_depois_de_chave: "K1", p_depois_de_id: "p1" });
  });

  it("marca a coluna como a carregar e ignora um segundo pedido enquanto dura", async () => {
    rpcMock.mockReturnValueOnce(ok(primeiraChamada()));
    const { result } = montar();
    await waitFor(() => expect(result.current.colunas.orcamento.haMais).toBe(true));
    let resolver: (v: unknown) => void = () => undefined;
    rpcMock.mockReturnValueOnce(new Promise((r) => { resolver = r; }));
    act(() => result.current.carregarMais("orcamento"));
    await waitFor(() => expect(result.current.aCarregarMais.has("orcamento")).toBe(true));
    act(() => result.current.carregarMais("orcamento"));
    expect(rpcMock).toHaveBeenCalledTimes(2);
    await act(async () => { resolver({ data: [], error: null }); });
    await waitFor(() => expect(result.current.aCarregarMais.has("orcamento")).toBe(false));
  });

  it("não pede nada numa coluna sem mais cartões", async () => {
    rpcMock.mockReturnValueOnce(ok(primeiraChamada()));
    const { result } = montar();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.carregarMais("porContactar"));
    act(() => result.current.carregarMais("contrato"));
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("um erro numa coluna mantém os cartões e fica guardado para essa coluna; repetir limpa-o", async () => {
    rpcMock.mockReturnValueOnce(ok(primeiraChamada()));
    const { result } = montar();
    await waitFor(() => expect(result.current.colunas.orcamento.haMais).toBe(true));
    rpcMock.mockReturnValueOnce(falha("NG009"));
    act(() => result.current.carregarMais("orcamento"));
    await waitFor(() => expect(result.current.errosAoCarregarMais.orcamento).toBeTruthy());
    expect(result.current.colunas.orcamento.cartoes).toHaveLength(2);
    expect(result.current.errosAoCarregarMais.porContactar).toBeUndefined();
    expect(result.current.isError).toBe(false);
    rpcMock.mockReturnValueOnce(ok([linhaNegocio("n3", "orcamento", { n_orcamentos: 1, total_coluna: 30, ha_mais: false })]));
    act(() => result.current.carregarMais("orcamento"));
    await waitFor(() => expect(result.current.colunas.orcamento.cartoes).toHaveLength(3));
    expect(result.current.errosAoCarregarMais.orcamento).toBeUndefined();
  });
});

describe("useQuadroPessoas: carregar mais, casos que não podem ficar mudos", () => {
  it("diz se pediu: true ao começar, true se já há um pedido em curso, false quando não há mais nada a pedir", async () => {
    rpcMock.mockReturnValueOnce(ok(primeiraChamada()));
    const { result } = montar();
    await waitFor(() => expect(result.current.colunas.orcamento.haMais).toBe(true));
    let resolver: (v: unknown) => void = () => undefined;
    rpcMock.mockReturnValueOnce(new Promise((r) => { resolver = r; }));
    let primeiro = false;
    let segundo = false;
    let semMais = true;
    act(() => { primeiro = result.current.carregarMais("orcamento"); });
    act(() => { segundo = result.current.carregarMais("orcamento"); });
    act(() => { semMais = result.current.carregarMais("porContactar"); });
    expect([primeiro, segundo, semMais]).toEqual([true, true, false]);
    await act(async () => { resolver({ data: [], error: null }); });
  });

  it("ha_mais sem cursor (contrato partido) é um erro de «Carregar mais» traduzido e observado, não um clique que não faz nada", async () => {
    rpcMock.mockReturnValueOnce(ok([
      linhaNegocio("n1", "orcamento", { n_orcamentos: 1, total_coluna: 30, valor_coluna: 10, ha_mais: true, chave_ordem: null }),
    ]));
    const { result } = montar();
    await waitFor(() => expect(result.current.colunas.orcamento.haMais).toBe(true));
    expect(result.current.colunas.orcamento.cursor).toBeNull();
    let pediu = true;
    act(() => { pediu = result.current.carregarMais("orcamento"); });
    expect(pediu).toBe(false);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(result.current.errosAoCarregarMais.orcamento?.chave).toBe("pessoasPagina.erroNeg.generico");
    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it("uma invalidação da Lista refaz só a primeira página: as páginas carregadas com «Carregar mais» deitam-se fora", async () => {
    rpcMock.mockReturnValueOnce(ok(primeiraChamada()));
    const { result, client } = montar();
    await waitFor(() => expect(result.current.colunas.orcamento.haMais).toBe(true));
    rpcMock.mockReturnValueOnce(ok([linhaNegocio("n3", "orcamento", { n_orcamentos: 1, total_coluna: 30, ha_mais: false })]));
    act(() => { result.current.carregarMais("orcamento"); });
    await waitFor(() => expect(result.current.colunas.orcamento.cartoes).toHaveLength(3));
    rpcMock.mockReturnValueOnce(ok(primeiraChamada()));
    await act(async () => { await client.invalidateQueries({ queryKey: listaPessoasQueryKey("org-1") }); });
    await waitFor(() => expect(result.current.colunas.orcamento.cartoes).toHaveLength(2));
  });
});

describe("useQuadroPessoas: troca de organização e de filtros", () => {
  it("outra organização pede de novo e não mostra os cartões da anterior enquanto carrega", async () => {
    rpcMock.mockReturnValueOnce(ok([linhaQuadro("a")]));
    const a = montar();
    await waitFor(() => expect(a.result.current.cartoes).toHaveLength(1));
    fonte = real("org-2");
    let resolver: (v: unknown) => void = () => undefined;
    rpcMock.mockReturnValueOnce(new Promise((r) => { resolver = r; }));
    const b = a;
    b.rerender({ f: { ...FILTROS }, ativo: true });
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(params(1).p_organization_id).toBe("org-2");
    expect(b.result.current.cartoes).toEqual([]);
    expect(b.result.current.isLoading).toBe(true);
    await act(async () => { resolver({ data: [], error: null }); });
  });

  it("ao mudar de filtro mantém os cartões anteriores (aMostrarAnterior) até chegarem os novos", async () => {
    rpcMock.mockReturnValueOnce(ok([linhaQuadro("a")]));
    const { result, rerender } = montar();
    await waitFor(() => expect(result.current.cartoes).toHaveLength(1));
    let resolver: (v: unknown) => void = () => undefined;
    rpcMock.mockReturnValueOnce(new Promise((r) => { resolver = r; }));
    rerender({ f: { ...FILTROS, papel: "cliente" }, ativo: true });
    await waitFor(() => expect(result.current.aMostrarAnterior).toBe(true));
    expect(result.current.cartoes).toHaveLength(1);
    await act(async () => { resolver({ data: [linhaQuadro("b", { papel: "cliente" })], error: null }); });
    await waitFor(() => expect(result.current.aMostrarAnterior).toBe(false));
    expect(result.current.cartoes.map((c) => c.id)).toEqual(["b"]);
  });
});
