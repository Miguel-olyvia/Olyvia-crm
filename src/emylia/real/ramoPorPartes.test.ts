// 22/01: a regra «exige produto» com o Catálogo leve. A troca «o cliente mantém a sanita e a base de duche?» só fica resolvida quando cada parte que o ramo TEM em produtos está escolhida
// (selecao.trocaResolvida). Com K.produtos só com 145 produtos, «o ramo não tem bases» seria falso: as partes do ramo procuram-se no servidor, pela categoria (filtroDoRamo).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { produtosDoRamoPorPartes } from "./ramoPorPartes";
import { limparCatalogoLido } from "./catalogoLeve";
import { trocaResolvida } from "../selecao";
import type { No } from "../v2/catalogoModelo";

const ORG = "11111111-1111-4111-a111-111111111111";
const ARVORE = [{ id: "raiz", n: "Louças", pai: null }, { id: "sub", n: "Sanitas", pai: "raiz" }] as unknown as No[];
const linha = (id: string, nome: string, sub: string | null = null) => ({ id, nome, subcategoria: sub });
const pagina = vi.fn();
vi.mock("./produtosPaginados", async (orig) => ({ ...(await orig<typeof import("./produtosPaginados")>()), lerProdutosPagina: (...a: unknown[]) => pagina(...a) }));

const pag = (produtos: unknown[]) => ({ ok: true, v: { total: produtos.length, pagina: 1, limite: 50, paginas: 1, produtos } });
beforeEach(() => { pagina.mockReset(); limparCatalogoLido(); });

describe("produtosDoRamoPorPartes", () => {
  it("uma pesquisa por parte da pergunta, no ramo (categoria de topo), e devolve os nomes", async () => {
    pagina.mockImplementation(async (_o: string, f: { q: string }) => pag(f.q.includes("sanita") ? [linha("s", "Sanita Roca")] : [linha("b", "Base de duche Roca", "Bases")]));
    const r = await produtosDoRamoPorPartes(ORG, ARVORE, "raiz", "O cliente mantém a sanita e a base de duche?");
    expect(pagina).toHaveBeenCalledTimes(2);
    expect(pagina).toHaveBeenCalledWith(ORG, expect.objectContaining({ q: "sanita", categoria: "raiz" }), 1);
    expect(pagina).toHaveBeenCalledWith(ORG, expect.objectContaining({ q: "base duche", categoria: "raiz" }), 1);
    expect(r).toEqual([{ n: "Sanita Roca", sub: "" }, { n: "Base de duche Roca", sub: "Bases" }]);
  });
  it("um nó que é subcategoria filtra pela subcategoria", async () => {
    pagina.mockResolvedValue(pag([]));
    await produtosDoRamoPorPartes(ORG, ARVORE, "sub", "O cliente mantém a sanita?");
    expect(pagina).toHaveBeenCalledWith(ORG, expect.objectContaining({ subcategoria: "sub" }), 1);
  });
  it("sem pergunta, ou uma pergunta sem objeto, não chama a base", async () => {
    expect(await produtosDoRamoPorPartes(ORG, ARVORE, "raiz", null)).toEqual([]);
    expect(pagina).not.toHaveBeenCalled();
  });
  it("uma pesquisa que falha dá null (não se sabe): quem chama não resolve a troca sozinho", async () => {
    pagina.mockResolvedValue({ ok: false, erro: "tempo" });
    expect(await produtosDoRamoPorPartes(ORG, ARVORE, "raiz", "O cliente mantém a sanita?")).toBeNull();
  });
  it("com o ramo do servidor, a parte «bidé» que o Catálogo leve não tem já não conta como «sem produtos»: a troca só se resolve com as duas partes", async () => {
    pagina.mockImplementation(async (_o: string, f: { q: string }) => pag(f.q === "sanita" ? [linha("s", "Sanita Roca")] : [linha("b", "Bidé Roca")]));
    const doRamo = (await produtosDoRamoPorPartes(ORG, ARVORE, "raiz", "O cliente mantém a sanita e o bidé?"))!;
    const o = { pergunta: "O cliente mantém a sanita e o bidé?" };
    // só a sanita escolhida (K leve não tem bidés): com o ramo só de K a troca resolvia-se; com o do servidor, não
    expect(trocaResolvida(o, [{ n: "Sanita Roca" }], [{ n: "Sanita Roca" }])).toBe(true);
    expect(trocaResolvida(o, [{ n: "Sanita Roca" }], doRamo)).toBe(false);
    expect(trocaResolvida(o, [{ n: "Sanita Roca" }, { n: "Bidé Roca" }], doRamo)).toBe(true);
  });
});
