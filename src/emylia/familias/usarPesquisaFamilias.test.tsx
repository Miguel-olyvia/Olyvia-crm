// A pesquisa NO SERVIDOR do passo «Escolher produtos»: páginas de 50, filtros em ids da base, pedidos atrasados descartados, erros.
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEM_FILTRO_PESQUISA, useAtrasado, useMarcasDoFiltro, usePesquisaFamilias, type FiltroPesquisa } from "./usarPesquisaFamilias";
import { linha, paginaDe } from "./fixturesFamilias";

const ORG = "11111111-1111-4111-a111-111111111111";
const lerPagina = vi.fn(), lerMarcas = vi.fn();
vi.mock("../real/produtosPaginados", async (orig) => ({
  ...(await orig<typeof import("../real/produtosPaginados")>()),
  lerProdutosPagina: (...a: unknown[]) => lerPagina(...a),
  lerMarcasDoFiltro: (...a: unknown[]) => lerMarcas(...a),
}));

beforeEach(() => { lerPagina.mockReset(); lerMarcas.mockReset(); });
const f = (extra: Partial<FiltroPesquisa> = {}): FiltroPesquisa => ({ ...SEM_FILTRO_PESQUISA, ...extra });

describe("usePesquisaFamilias", () => {
  it("sem organização não chama a base", async () => {
    renderHook(() => usePesquisaFamilias(null, f()));
    await new Promise((r) => setTimeout(r, 30));
    expect(lerPagina).not.toHaveBeenCalled();
  });

  it("lê a página 1 com os filtros em ids da base e devolve linhas, total e páginas", async () => {
    lerPagina.mockResolvedValue(paginaDe([linha("a", "A"), linha("b", "B")], { total: 120, paginas: 3 }));
    const { result } = renderHook(() => usePesquisaFamilias(ORG, f({ q: "velar", categoria: "c1", subcategoria: "s1", modelo: "m1", marca: "Cunha" })));
    await waitFor(() => expect(result.current.linhas).toHaveLength(2));
    expect(lerPagina).toHaveBeenCalledWith(ORG, { q: "velar", categoria: "c1", subcategoria: "s1", modelo: "m1", marca: "Cunha", semCategoria: false }, 1);
    expect(result.current).toMatchObject({ total: 120, pagina: 1, paginas: 3, limite: 50, aCarregar: false, erro: null });
  });

  it("irPara pede a página pedida; mudar um filtro volta à página 1", async () => {
    lerPagina.mockImplementation(async (_o: string, _f: unknown, p: number) => paginaDe([linha(`p${p}`, `P${p}`)], { total: 100, pagina: p, paginas: 2 }));
    const { result, rerender } = renderHook(({ filtro }) => usePesquisaFamilias(ORG, filtro), { initialProps: { filtro: f() } });
    await waitFor(() => expect(result.current.linhas.map((l) => l.id)).toEqual(["p1"]));
    act(() => result.current.irPara(2));
    await waitFor(() => expect(result.current.linhas.map((l) => l.id)).toEqual(["p2"]));
    expect(result.current.pagina).toBe(2);
    rerender({ filtro: f({ marca: "Roca" }) });
    await waitFor(() => expect(lerPagina).toHaveBeenLastCalledWith(ORG, expect.objectContaining({ marca: "Roca" }), 1));
    await waitFor(() => expect(result.current.linhas.map((l) => l.id)).toEqual(["p1"]));
  });

  it("uma resposta atrasada de um filtro antigo é descartada", async () => {
    let soltar: (v: unknown) => void = () => undefined;
    lerPagina.mockImplementationOnce(() => new Promise((r) => { soltar = r; }));
    lerPagina.mockResolvedValueOnce(paginaDe([linha("novo", "Novo")]));
    const { result, rerender } = renderHook(({ filtro }) => usePesquisaFamilias(ORG, filtro), { initialProps: { filtro: f({ marca: "A" }) } });
    rerender({ filtro: f({ marca: "B" }) });
    await waitFor(() => expect(result.current.linhas.map((l) => l.id)).toEqual(["novo"]));
    await act(async () => { soltar(paginaDe([linha("velho", "Velho")])); });
    expect(result.current.linhas.map((l) => l.id)).toEqual(["novo"]);
  });

  it("um erro da base chega como texto e «tentar» repete o pedido", async () => {
    lerPagina.mockResolvedValueOnce({ ok: false, erro: "Sem ligação." }).mockResolvedValueOnce(paginaDe([linha("a", "A")]));
    const { result } = renderHook(() => usePesquisaFamilias(ORG, f()));
    await waitFor(() => expect(result.current.erro).toBe("Sem ligação."));
    expect(result.current.linhas).toEqual([]);
    act(() => result.current.tentar());
    await waitFor(() => expect(result.current.linhas).toHaveLength(1));
    expect(result.current.erro).toBeNull();
  });

  it("uma exceção ao ler (rede) também vira erro, sem rebentar", async () => {
    lerPagina.mockRejectedValueOnce(new Error("rede em baixo"));
    const { result } = renderHook(() => usePesquisaFamilias(ORG, f()));
    await waitFor(() => expect(result.current.erro).toBe("rede em baixo"));
  });
});

describe("usePesquisaFamilias: lista anterior, clamp, pedidos suspensos e resposta tardia", () => {
  it("com ativa=false não pede nada; ao ativar, pede", async () => {
    lerPagina.mockResolvedValue(paginaDe([linha("a", "A")]));
    const { result, rerender } = renderHook(({ ativa }) => usePesquisaFamilias(ORG, f(), { ativa }), { initialProps: { ativa: false } });
    await new Promise((r) => setTimeout(r, 30));
    expect(lerPagina).not.toHaveBeenCalled();
    expect(result.current.aCarregar).toBe(true);
    rerender({ ativa: true });
    await waitFor(() => expect(result.current.linhas).toHaveLength(1));
  });

  it("enquanto lê outra página ou outro filtro, mantém a última página lida e diz que está a carregar (a lista não esvazia)", async () => {
    let soltar: (v: unknown) => void = () => undefined;
    lerPagina.mockResolvedValueOnce(paginaDe([linha("a", "A")], { total: 100, paginas: 2 })).mockImplementationOnce(() => new Promise((r) => { soltar = r; }));
    const { result } = renderHook(() => usePesquisaFamilias(ORG, f()));
    await waitFor(() => expect(result.current.linhas.map((l) => l.id)).toEqual(["a"]));
    act(() => result.current.irPara(2));
    await waitFor(() => expect(result.current.aCarregar).toBe(true));
    expect(result.current.linhas.map((l) => l.id)).toEqual(["a"]);
    await act(async () => { soltar(paginaDe([linha("b", "B")], { total: 100, pagina: 2, paginas: 2 })); });
    await waitFor(() => expect(result.current.linhas.map((l) => l.id)).toEqual(["b"]));
    expect(result.current.aCarregar).toBe(false);
  });

  it("um erro esvazia a lista (não se mostra a antiga como se fosse atual)", async () => {
    lerPagina.mockResolvedValueOnce(paginaDe([linha("a", "A")])).mockResolvedValueOnce({ ok: false, erro: "falhou" });
    const { result, rerender } = renderHook(({ filtro }) => usePesquisaFamilias(ORG, filtro), { initialProps: { filtro: f() } });
    await waitFor(() => expect(result.current.linhas).toHaveLength(1));
    rerender({ filtro: f({ marca: "X" }) });
    await waitFor(() => expect(result.current.erro).toBe("falhou"));
    expect(result.current.linhas).toEqual([]);
  });

  it("uma página para lá da última (os produtos diminuíram) volta à última que existe", async () => {
    lerPagina.mockImplementation(async (_o: string, _f: unknown, p: number) => (p > 2 ? paginaDe([], { total: 80, pagina: p, paginas: 2 }) : paginaDe([linha("p" + p, "P" + p)], { total: 80, pagina: p, paginas: 2 })));
    const { result } = renderHook(() => usePesquisaFamilias(ORG, f()));
    await waitFor(() => expect(result.current.linhas).toHaveLength(1));
    act(() => result.current.irPara(5));
    await waitFor(() => expect(lerPagina).toHaveBeenLastCalledWith(ORG, expect.anything(), 2));
    await waitFor(() => expect(result.current.linhas.map((l) => l.id)).toEqual(["p2"]));
  });

  it("uma resposta que chega depois de desmontar não faz nada (nem erro)", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let soltar: (v: unknown) => void = () => undefined;
    lerPagina.mockImplementation(() => new Promise((r) => { soltar = r; }));
    const { unmount } = renderHook(() => usePesquisaFamilias(ORG, f()));
    await waitFor(() => expect(lerPagina).toHaveBeenCalled());
    unmount();
    await act(async () => { soltar(paginaDe([linha("a", "A")])); });
    expect(erro).not.toHaveBeenCalled();
    erro.mockRestore();
  });
});

describe("useAtrasado (debounce)", () => {
  it("só assenta o valor depois do atraso; o último vence", async () => {
    const { result, rerender } = renderHook(({ v }) => useAtrasado(v, 40), { initialProps: { v: "" } });
    rerender({ v: "a" }); rerender({ v: "ab" });
    expect(result.current).toBe("");
    await waitFor(() => expect(result.current).toBe("ab"));
  });
});

describe("useMarcasDoFiltro", () => {
  const omissao = ["Zeta", "Alfa"];
  it("usa as marcas da base (com contagem), sem repetidos nem acentos a mais", async () => {
    lerMarcas.mockResolvedValue({ ok: true, v: { marcas: [{ id: null, nome: "Cunha", n: 3 }, { id: null, nome: "cunha ", n: 1 }, { id: null, nome: "Roca", n: 2 }], semMarca: 0, total: 6 } });
    const { result } = renderHook(() => useMarcasDoFiltro(ORG, omissao, f({ categoria: "c1" })));
    await waitFor(() => expect(result.current.itens.map((i) => i.nome)).toEqual(["Cunha · 3", "Roca · 2"]));
    expect(result.current.itens[0].id).toBe("Cunha");
    expect(lerMarcas).toHaveBeenCalledWith(ORG, expect.objectContaining({ categoria: "c1", marca: "" }));
  });
  it("a marca escolhida não entra no pedido das marcas", async () => {
    lerMarcas.mockResolvedValue({ ok: true, v: { marcas: [], semMarca: 0, total: 0 } });
    renderHook(() => useMarcasDoFiltro(ORG, omissao, f({ marca: "Roca" })));
    await waitFor(() => expect(lerMarcas).toHaveBeenCalled());
    expect(lerMarcas.mock.calls[0][1].marca).toBe("");
  });
  it("sem a função na base (v: null) ou com erro, ficam as marcas do arranque, sem erro visível", async () => {
    lerMarcas.mockResolvedValueOnce({ ok: true, v: null });
    const a = renderHook(() => useMarcasDoFiltro(ORG, omissao, f()));
    await waitFor(() => expect(a.result.current.aLer).toBe(false));
    expect(a.result.current.itens.map((i) => i.nome)).toEqual(["Zeta", "Alfa"]);
    lerMarcas.mockResolvedValueOnce({ ok: false, erro: "x" });
    const b = renderHook(() => useMarcasDoFiltro(ORG, omissao, f({ q: "z" })));
    await waitFor(() => expect(b.result.current.aLer).toBe(false));
    expect(b.result.current.itens.map((i) => i.nome)).toEqual(["Zeta", "Alfa"]);
  });
});
