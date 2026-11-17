// 17/11 (Rúben: «carrega 50 e depois faz um preload de mais 50 ou 100 para as próximas páginas, por otimização»): o Estúdio recebe logo a
// 1.ª página de cada subcategoria e, por trás, as seguintes.
import { describe, expect, it, vi } from "vitest";

const pedidos: { sub: string; q: string; pagina: number }[] = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => ({
      select: () => ({
        eq: async () => ({ data: t === "product_categories" ? [{ id: "sub-bases", name: "Bases Duche" }] : [], error: null }),
        in: async () => ({ data: [], error: null }), // sem serviços ligados: fica a mão de obra de referência
      }),
    }),
  },
}));
vi.mock("@/emylia/real/produtosPaginados", () => ({
  SEM_FILTRO_SERVIDOR: { q: "", categoria: "", subcategoria: "", modelo: "", marca: "", semCategoria: false },
  lerProdutosPagina: async (_org: string, f: { subcategoria: string; q: string }, pagina: number) => {
    pedidos.push({ sub: f.subcategoria, q: f.q, pagina });
    // 3 páginas de 2 bases (a pesquisa por cor devolve uma repetida da 1.ª página)
    const linha = (i: number) => ({ id: `b${i}`, nome: `Base de Duche ${i} 70x120 Branco`, pvp: 100 + i, ativo: true, unidade: "un", modelo: null, marca: null, atributos_resumo: null });
    const produtos = f.q ? [linha(1)] : [linha(pagina * 2 - 1), linha(pagina * 2)];
    return { ok: true, v: { total: 6, pagina, limite: 2, paginas: f.q ? 1 : 3, produtos } };
  },
}));

import { carregarProdutosDoEstudio, PAGINAS_A_MAIS } from "./catalogoRealDoEstudio";

describe("pré-carregar as páginas seguintes", () => {
  it("a 1.ª página chega logo; as seguintes (até PAGINAS_A_MAIS) juntam-se por trás, sem repetir", async () => {
    let mais: string[] = [];
    const chegou = new Promise<void>((ok) => {
      void carregarProdutosDoEstudio("org", (todos) => { mais = todos.map((p) => p.id); ok(); }).then((primeira) => {
        expect(primeira.map((p) => p.id)).toEqual(["b1", "b2"]);
      });
    });
    await chegou;
    expect(PAGINAS_A_MAIS).toBe(2);
    expect(mais.sort()).toEqual(["b1", "b2", "b3", "b4", "b5", "b6"]);
    // a pesquisa por cor só lê a 1.ª página; as seguintes são só da lista geral
    expect(pedidos.filter((p) => p.q).every((p) => p.pagina === 1)).toBe(true);
    expect(pedidos.filter((p) => !p.q).map((p) => p.pagina).sort()).toEqual([1, 2, 3]);
  });
});
