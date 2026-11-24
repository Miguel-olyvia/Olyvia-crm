// O «Modelo 3D» escolhido (produto > subcategoria > categoria) chega ao Estúdio: cada linha de cat_ler_produtos_pagina traz `modelo3d`, `subcategoria_id` e
// `categoria_id`; o modelo de cada categoria e subcategoria lê-se de product_categories.modelo_3d (tolerante: sem a coluna, a leitura falha e fica sem modelos);
// o 3D do Estúdio usa o modelo resolvido em vez do genérico do tipo.
import { afterEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({ categorias: { data: [] as unknown[] | null, error: null as unknown }, pedidos: [] as string[], lancar: false }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => ({
      select: (cols: string) => ({
        eq: () => {
          base.pedidos.push(`${t}:${cols}`);
          if (base.lancar) throw new Error("sem rede");
          if (t === "product_categories" && cols.includes("modelo_3d")) return Promise.resolve(base.categorias);
          return Promise.resolve({ data: [], error: null });
        },
        in: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}));
vi.mock("@/emylia/real/produtosPaginados", async (orig) => ({
  ...(await orig<typeof import("@/emylia/real/produtosPaginados")>()),
  lerProdutosPagina: async () => ({ ok: true, v: { total: 0, pagina: 1, limite: 50, paginas: 1, produtos: [] } }),
}));

import { modelosDasCategorias, produtoDaLinha } from "./catalogoRealDoEstudio";
import { espacoDoEstudio } from "./estudioNo3D";
import { PROJETO_EXEMPLO } from "./exemploEstudio";
import { usarProdutosReais, type Produto } from "./catalogoFake";
import type { LinhaPaginaProduto } from "@/emylia/real/produtosPaginados";

const linha = (nome: string, extra: Partial<LinhaPaginaProduto> = {}): LinhaPaginaProduto => ({
  id: "id-" + nome, nome, sku: null, sku_gerado: null, marca: "X", categoria_id: "cat1", categoria: "Casa de banho", subcategoria_id: "sub1",
  subcategoria: "Sanitas", modelo_id: null, modelo: null, modelo_numero: null, unidade: "un", custo: 100, pvp: 199.9, grossista: null,
  distribuidor: null, fornecedor: null, ativo: true, imagem: null, atributos_resumo: null, ...extra,
});
afterEach(() => { vi.restoreAllMocks(); usarProdutosReais([]); base.categorias = { data: [], error: null }; base.pedidos = []; base.lancar = false; });

describe("produtoDaLinha: o modelo 3D resolvido", () => {
  const MAPA = new Map([["cat1", "banheira"], ["sub1", "sanita"]]);
  it("sem modelo em lado nenhum, o produto não leva a chave (igual a hoje)", () => {
    expect("modelo3d" in produtoDaLinha(linha("Peça X"), "sanita", new Map())!).toBe(false);
  });
  it("herda da subcategoria, depois da categoria, e diz de onde veio", () => {
    expect(produtoDaLinha(linha("Peça X"), "sanita", MAPA)).toMatchObject({ modelo3d: "sanita", modelo3dOrigem: "subcategoria" });
    expect(produtoDaLinha(linha("Peça X", { subcategoria_id: "outra" }), "sanita", MAPA)).toMatchObject({ modelo3d: "banheira", modelo3dOrigem: "categoria" });
  });
  it("o do próprio produto manda sobre os dois", () => {
    expect(produtoDaLinha(linha("Peça X", { modelo3d: "bide" }), "sanita", MAPA)).toMatchObject({ modelo3d: "bide", modelo3dOrigem: "produto" });
  });
  it("um id do produto com formato válido mas que o 3D não conhece passa para o nível de cima", () => {
    expect(produtoDaLinha(linha("Peça X", { modelo3d: "modelo_novo" }), "sanita", MAPA)).toMatchObject({ modelo3d: "sanita", modelo3dOrigem: "subcategoria" });
  });
  it("um valor fora do formato da base é ignorado", () => {
    expect("modelo3d" in produtoDaLinha(linha("Peça X", { modelo3d: "Com Espaços" }), "sanita", new Map())!).toBe(false);
  });
});

describe("modelosDasCategorias: lê product_categories.modelo_3d, tolerante", () => {
  it("devolve id → modelo das categorias e subcategorias que escolheram", async () => {
    base.categorias = { data: [{ id: "c1", modelo_3d: "banheira" }, { id: "s1", modelo_3d: null }, { id: "s2", modelo_3d: "sanita" }, { id: "s3", modelo_3d: "Mau Formato" }], error: null };
    const m = await modelosDasCategorias("org");
    expect([...m.entries()]).toEqual([["c1", "banheira"], ["s2", "sanita"]]);
    expect(base.pedidos).toEqual(["product_categories:id,modelo_3d"]);
  });
  it("a coluna ainda não existe (a migração está por aplicar): fica sem modelos, em silêncio (42703, PGRST204 ou a mensagem «column … does not exist»)", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const error of [
      { code: "42703", message: "column product_categories.modelo_3d does not exist" },
      { code: "PGRST204", message: "Could not find the 'modelo_3d' column of 'product_categories' in the schema cache" },
      { message: 'column "modelo_3d" does not exist' },
    ]) {
      base.categorias = { data: null, error };
      expect((await modelosDasCategorias("org")).size).toBe(0);
    }
    expect(aviso).not.toHaveBeenCalled();
  });
  it("qualquer outro erro (RLS, rede, tempo) também fica sem modelos, mas NÃO em silêncio: console.warn com o motivo", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    base.categorias = { data: null, error: { code: "42501", message: "permission denied for table product_categories" } };
    expect((await modelosDasCategorias("org")).size).toBe(0);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(String(aviso.mock.calls[0].join(" "))).toMatch(/permission denied/);
  });
  it("uma excepção (sem rede) fica sem modelos e avisa", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    base.lancar = true;
    expect((await modelosDasCategorias("org")).size).toBe(0);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(String(aviso.mock.calls[0].join(" "))).toMatch(/sem rede/);
  });
});

describe("o 3D do Estúdio usa o modelo escolhido", () => {
  const com = (modelo3d?: string, modelo3dOrigem?: "produto" | "subcategoria" | "categoria"): Produto => ({ id: "real-san", cat: "sanita", n: "Peça misteriosa X1", colecao: "", cores: ["branco"], hex: "#ffffff", preco: 100, un: "un", inst: 0, ...(modelo3d ? { modelo3d } : {}), ...(modelo3dOrigem ? { modelo3dOrigem } : {}) });
  const modeloDaSanita = (p: Produto) => {
    usarProdutosReais([p]);
    const peca = PROJETO_EXEMPLO.depois.pecas.find((x) => x.tipo === "sanita");
    if (!peca) throw new Error("o exemplo devia ter uma sanita");
    const r = espacoDoEstudio({ ...PROJETO_EXEMPLO, escolhas: { ...PROJETO_EXEMPLO.escolhas, [peca.id]: p.id } }, "depois");
    if ("erro" in r || !r.ok) throw new Error("a planta do exemplo devia abrir em 3D");
    const pc = r.espaco.pecas.find((x) => x.id === peca.id)!;
    return r.modelos[pc.produtoId];
  };
  it("sem escolha, o genérico do tipo, como hoje", () => {
    const m = modeloDaSanita(com());
    expect(m.escolha).toBeUndefined();
    expect(m.nome).toBe("Peça misteriosa X1");
  });
  it("com o modelo escolhido (bidé), a peça é um bidé, mas a cor, o nome e a origem do Estúdio ficam", () => {
    const m = modeloDaSanita(com("bide"));
    expect(m.mockup3d.generico?.id).toBe("bide");
    expect(m.tipo).toBe("bide");
    expect(m.escolha).toEqual({ modelo: "bide", origem: "produto" });
    expect(m.mockup3d.cor).toBe("#ffffff");
    expect(m.categoria).toBe("Estúdio");
    expect(m.nome).toBe("Peça misteriosa X1");
  });
  it("a origem real (subcategoria, categoria) chega ao modelo; sem ela, «produto»", () => {
    expect(modeloDaSanita(com("bide", "subcategoria")).escolha).toEqual({ modelo: "bide", origem: "subcategoria" });
    expect(modeloDaSanita(com("bide", "categoria")).escolha).toEqual({ modelo: "bide", origem: "categoria" });
  });
  it("um id que o 3D não conhece fica como sem escolha", () => {
    expect(modeloDaSanita(com("modelo_inventado")).escolha).toBeUndefined();
  });
});
