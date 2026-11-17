// 17/11: a pesquisa de produtos no servidor (usePesquisaProdutos): debounce, páginas de 50, pesquisas atrasadas descartadas, erros.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePesquisaProdutos } from "./pesquisaProdutos";
import { aoRegistarProduto, registarProdutoLido } from "./catalogoLeve";
import { lerCatalogo, reporCatalogo } from "../v2/catalogoStore";

const ORG = "11111111-1111-4111-a111-111111111111";
const linha = (id: string) => ({ id, nome: `Produto ${id}`, sku: null, sku_gerado: null, marca: null, categoria_id: null, categoria: null, subcategoria_id: null, subcategoria: null,
  modelo_id: null, modelo: null, modelo_numero: null, unidade: "un", custo: 1, pvp: 2, grossista: null, distribuidor: null, fornecedor: null, ativo: true, imagem: null, atributos_resumo: null });
const pagina = vi.fn();
vi.mock("./produtosPaginados", async (orig) => ({ ...(await orig<typeof import("./produtosPaginados")>()), lerProdutosPagina: (...a: unknown[]) => pagina(...a) }));
vi.mock("./produtosLeves", () => ({ lerProdutoFicha: vi.fn() }));

beforeEach(() => { pagina.mockReset(); });
afterEach(() => { vi.useRealTimers(); reporCatalogo(); });

describe("usePesquisaProdutos", () => {
  it("sem `ativo` não chama a base; sem organização também não", async () => {
    renderHook(() => usePesquisaProdutos(ORG, { q: "" }, { ativo: false }));
    renderHook(() => usePesquisaProdutos(null, { q: "" }));
    await new Promise((r) => setTimeout(r, 30));
    expect(pagina).not.toHaveBeenCalled();
  });
  it("lê a página 1 de 50 e devolve os produtos, o total e se há mais páginas", async () => {
    pagina.mockResolvedValue({ ok: true, v: { total: 120, pagina: 1, limite: 50, paginas: 3, produtos: [linha("a"), linha("b")] } });
    const { result } = renderHook(() => usePesquisaProdutos(ORG, { q: "" }));
    await waitFor(() => expect(result.current.linhas).toHaveLength(2));
    expect(pagina).toHaveBeenCalledWith(ORG, expect.objectContaining({ q: "" }), 1);
    expect(result.current.total).toBe(120);
    expect(result.current.maisPaginas).toBe(true);
  });
  it("maisUma junta a página seguinte, sem repetir produtos", async () => {
    pagina.mockResolvedValueOnce({ ok: true, v: { total: 3, pagina: 1, limite: 50, paginas: 2, produtos: [linha("a"), linha("b")] } })
      .mockResolvedValueOnce({ ok: true, v: { total: 3, pagina: 2, limite: 50, paginas: 2, produtos: [linha("b"), linha("c")] } });
    const { result } = renderHook(() => usePesquisaProdutos(ORG, { q: "" }));
    await waitFor(() => expect(result.current.linhas).toHaveLength(2));
    act(() => result.current.maisUma());
    await waitFor(() => expect(result.current.linhas.map((l) => l.id)).toEqual(["a", "b", "c"]));
    expect(pagina).toHaveBeenLastCalledWith(ORG, expect.anything(), 2);
    expect(result.current.maisPaginas).toBe(false);
  });
  it("debounce: várias letras seguidas dão UMA pesquisa, com o último texto", async () => {
    vi.useFakeTimers();
    pagina.mockResolvedValue({ ok: true, v: { total: 0, pagina: 1, limite: 50, paginas: 1, produtos: [] } });
    const { rerender } = renderHook(({ q }) => usePesquisaProdutos(ORG, { q }, { atrasoMs: 300 }), { initialProps: { q: "" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    pagina.mockClear();
    for (const q of ["b", "ba", "bas", "base"]) { rerender({ q }); await act(async () => { await vi.advanceTimersByTimeAsync(100); }); }
    expect(pagina).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(pagina).toHaveBeenCalledTimes(1);
    expect(pagina).toHaveBeenCalledWith(ORG, expect.objectContaining({ q: "base" }), 1);
  });
  it("uma resposta atrasada de uma pesquisa antiga não apaga a mais nova", async () => {
    let soltar!: (v: unknown) => void;
    pagina.mockImplementationOnce(() => new Promise((r) => { soltar = r; }));
    pagina.mockResolvedValue({ ok: true, v: { total: 1, pagina: 1, limite: 50, paginas: 1, produtos: [linha("novo")] } });
    const { result, rerender } = renderHook(({ q }) => usePesquisaProdutos(ORG, { q }, { atrasoMs: 0 }), { initialProps: { q: "" } });
    rerender({ q: "x" });
    await waitFor(() => expect(result.current.linhas.map((l) => l.id)).toEqual(["novo"]));
    await act(async () => { soltar({ ok: true, v: { total: 1, pagina: 1, limite: 50, paginas: 1, produtos: [linha("velho")] } }); });
    expect(result.current.linhas.map((l) => l.id)).toEqual(["novo"]);
  });
  it("um erro da base fica à vista e a lista fica vazia", async () => {
    pagina.mockResolvedValue({ ok: false, erro: "statement timeout" });
    const { result } = renderHook(() => usePesquisaProdutos(ORG, { q: "" }));
    await waitFor(() => expect(result.current.erro).toBe("statement timeout"));
    expect(result.current.linhas).toEqual([]);
  });
});

describe("registarProdutoLido", () => {
  const p = { id: "p1", n: "Base", custo: 5, un: "un", marca: "", fornecedor: "", data: "2026-11-01", no: null };
  it("avisa quem grava ANTES de entrar no Catálogo, e só uma vez por produto", () => {
    const antes: boolean[] = [];
    const sai = aoRegistarProduto((x) => antes.push(lerCatalogo().produtos.some((y) => y.id === x.id)));
    registarProdutoLido(p);
    registarProdutoLido({ ...p, custo: 99 });
    sai();
    expect(antes).toEqual([false]);
    expect(lerCatalogo().produtos.filter((y) => y.id === "p1")).toHaveLength(1);
    expect(lerCatalogo().produtos.find((y) => y.id === "p1")?.custo).toBe(5);
  });
  it("quem já saiu deixa de ser avisado", () => {
    const f = vi.fn();
    aoRegistarProduto(f)();
    registarProdutoLido(p);
    expect(f).not.toHaveBeenCalled();
  });
});
