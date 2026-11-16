// 16/11: a cache das páginas de produtos (pré-carregamento de N+1 e N+2). Aqui a cache sozinha, com a leitura simulada; o ecrã está em CatalogoProdutosPagina.test.tsx.
import { describe, expect, it, vi } from "vitest";
import { CachePaginas } from "./cachePaginasProdutos";
import { SEM_FILTRO_SERVIDOR, type PaginaProdutos } from "./produtosPaginados";
import type { Res } from "../fichaProdutoDados";

const pag = (pagina: number, paginas = 9): PaginaProdutos => ({ total: paginas * 50, pagina, limite: 50, paginas, produtos: [] });
const montar = (max?: number) => {
  const ler = vi.fn(async (_o: string, _f: unknown, p: number): Promise<Res<PaginaProdutos>> => ({ ok: true, v: pag(p) }));
  return { ler, c: new CachePaginas(ler, max) };
};
const vazio = () => new Promise<void>((r) => setTimeout(r, 0));
const F = SEM_FILTRO_SERVIDOR;

describe("CachePaginas", () => {
  it("obter lê uma vez e guarda; ver devolve o guardado", async () => {
    const { ler, c } = montar();
    expect(c.ver("o", F, 1)).toBeUndefined();
    await c.obter("o", F, 1);
    await c.obter("o", F, 1);
    expect(ler).toHaveBeenCalledTimes(1);
    expect(c.ver("o", F, 1)?.pagina).toBe(1);
  });
  it("dois pedidos da mesma página em voo partilham a mesma leitura", async () => {
    const { ler, c } = montar();
    await Promise.all([c.obter("o", F, 2), c.obter("o", F, 2)]);
    expect(ler).toHaveBeenCalledTimes(1);
  });
  it("precarregar pede as duas seguintes, sem passar da última página", async () => {
    const { ler, c } = montar();
    c.precarregar("o", F, 1, 9);
    await vazio();
    expect(ler.mock.calls.map((x) => x[2])).toEqual([2, 3]);
    c.precarregar("o", F, 8, 9);
    c.precarregar("o", F, 9, 9);
    await vazio();
    expect(ler.mock.calls.map((x) => x[2])).toEqual([2, 3, 9]);
  });
  it("precarregar não repete o que já está em cache", async () => {
    const { ler, c } = montar();
    c.precarregar("o", F, 1, 9);
    await vazio();
    c.precarregar("o", F, 2, 9);
    await vazio();
    expect(ler.mock.calls.map((x) => x[2])).toEqual([2, 3, 4]);
  });
  it("falha no pré-carregamento é silenciosa e não fica em cache (lê-se normalmente depois)", async () => {
    const ler = vi.fn(async (): Promise<Res<PaginaProdutos>> => ({ ok: false, erro: "x" }));
    const c = new CachePaginas(ler);
    c.precarregar("o", F, 1, 9);
    await vazio();
    expect(c.ver("o", F, 2)).toBeUndefined();
    const rejeita = new CachePaginas(vi.fn(async () => { throw new Error("rede"); }));
    expect(() => rejeita.precarregar("o", F, 1, 9)).not.toThrow();
    await vazio();
    expect(rejeita.ver("o", F, 2)).toBeUndefined();
    ler.mockClear();
    await c.obter("o", F, 2);
    expect(ler).toHaveBeenCalledTimes(1);
  });
  it("uma mudança de filtro, de organização ou de versão limpa a cache", async () => {
    const { c } = montar();
    c.contexto("o", F, "v1");
    await c.obter("o", F, 1);
    c.contexto("o", F, "v1");
    expect(c.ver("o", F, 1)).toBeDefined();
    c.contexto("o", { ...F, q: "roca" }, "v1");
    expect(c.ver("o", F, 1)).toBeUndefined();
    await c.obter("o", { ...F, q: "roca" }, 1);
    c.contexto("outra", { ...F, q: "roca" }, "v1");
    expect(c.ver("outra", { ...F, q: "roca" }, 1)).toBeUndefined();
    await c.obter("outra", { ...F, q: "roca" }, 1);
    c.contexto("outra", { ...F, q: "roca" }, "v2");
    expect(c.ver("outra", { ...F, q: "roca" }, 1)).toBeUndefined();
  });
  it("uma resposta que chega depois de a cache ser limpa é ignorada", async () => {
    let soltar: (r: Res<PaginaProdutos>) => void = () => {};
    const ler = vi.fn(() => new Promise<Res<PaginaProdutos>>((r) => { soltar = r; }));
    const c = new CachePaginas(ler);
    const p = c.obter("o", F, 1);
    c.limpar();
    soltar({ ok: true, v: pag(1) });
    await p;
    expect(c.ver("o", F, 1)).toBeUndefined();
  });
  it("guarda no máximo `max` páginas e descarta as mais antigas", async () => {
    const { c } = montar(3);
    for (const p of [1, 2, 3, 4]) await c.obter("o", F, p);
    expect(c.ver("o", F, 1)).toBeUndefined();
    expect([2, 3, 4].map((p) => !!c.ver("o", F, p))).toEqual([true, true, true]);
  });
  it("por omissão guarda 20 páginas", async () => {
    const { c } = montar();
    for (let p = 1; p <= 21; p++) await c.obter("o", F, p);
    expect(c.ver("o", F, 1)).toBeUndefined();
    expect(c.ver("o", F, 2)).toBeDefined();
  });
});
