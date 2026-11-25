// 23/11 (testarh, Mudelar): a pesquisa do Estúdio pela referência (SKU), os mais parecidos primeiro e as páginas seguintes do servidor.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const srv = vi.hoisted(() => ({
  novaExiste: true,
  chamadasNova: [] as { q: string; subs: readonly string[]; pagina: number }[],
  chamadasAntiga: [] as { sub: string; q: string; pagina: number }[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => ({
      select: () => ({
        eq: async () => ({ data: t === "product_categories" ? [{ id: "sub-moveis", name: "Móveis de lavatório" }] : [], error: null }),
        in: async () => ({ data: [], error: null }), // sem serviços ligados: fica a mão de obra de referência
      }),
    }),
  },
}));

const linha = (id: string, nome: string, sku: string, extra: Record<string, unknown> = {}) => ({
  id, nome, sku, sku_gerado: false, marca: "AXIS", categoria_id: null, categoria: null, subcategoria_id: "sub-moveis",
  subcategoria: "Móveis de lavatório", modelo_id: null, modelo: null, modelo_numero: null, unidade: "un", custo: 100, pvp: 300,
  grossista: null, distribuidor: null, fornecedor: null, ativo: true, imagem: null, atributos_resumo: null, ...extra,
});

vi.mock("@/emylia/real/produtosPaginados", () => ({
  SEM_FILTRO_SERVIDOR: { q: "", categoria: "", subcategoria: "", modelo: "", marca: "", semCategoria: false },
  // o arranque e a leitura antiga (cat_ler_produtos_pagina): 2 páginas por pesquisa
  lerProdutosPagina: async (_org: string, f: { subcategoria: string; q: string }, pagina: number) => {
    srv.chamadasAntiga.push({ sub: f.subcategoria, q: f.q, pagina });
    if (!f.q) return { ok: true, v: { total: 1, pagina, limite: 50, paginas: 1, produtos: [linha("m0", "Móvel AXIS Suspenso 80x50x36 Branco", "MACBML0001")] } };
    return { ok: true, v: { total: 2, pagina, limite: 1, paginas: 2, produtos: [linha(`antigo-${pagina}`, `Móvel AXIS Antigo ${pagina}`, `OLD${pagina}`)] } };
  },
  // a pesquisa nova (cat_estudio_procurar_produtos): 3 páginas; null = a função ainda não existe na base
  lerPesquisaDoEstudio: async (_org: string, q: string, subs: readonly string[], pagina: number) => {
    srv.chamadasNova.push({ q, subs, pagina });
    if (!srv.novaExiste) return { ok: true, v: null };
    return { ok: true, v: { total: 3, pagina, limite: 1, paginas: 3, produtos: [linha(`novo-${pagina}`, `Móvel AXIS Novo ${pagina}`, `NEW${pagina}`)] } };
  },
}));

import { carregarProdutosDoEstudio, produtoDaLinha, procurarNoCatalogoReal } from "./catalogoRealDoEstudio";
import { bateComPesquisa, grauDaPesquisa, ordenarPorPesquisa } from "./pesquisaEstudio";
import { produtosReais, usarProdutosReais, type Produto } from "./catalogoFake";
import type { LinhaPaginaProduto } from "@/emylia/real/produtosPaginados";

const movel = (id: string, nome: string, sku: string, extra: Record<string, unknown> = {}): Produto =>
  produtoDaLinha(linha(id, nome, sku, extra) as unknown as LinhaPaginaProduto, "movel")!;

afterEach(() => usarProdutosReais([]));

describe("a referência (SKU)", () => {
  const alvo = movel("alvo", "Móvel AXIS Suspenso c/lavatório 60x50x36 2 Gav Fundo Reduzido", "MACBML0092");
  const base = produtoDaLinha(linha("b", "Base de Duche CACH 70x120 Branco", "DBBD0098") as unknown as LinhaPaginaProduto, "base")!;

  it("o produto do Estúdio guarda a referência", () => {
    expect(alvo.ref).toBe("MACBML0092");
    expect(base.ref).toBe("DBBD0098");
  });
  it("a referência inteira, parte dela, com traços ou espaços, sem maiúsculas", () => {
    expect(bateComPesquisa(alvo, "MACBML0092")).toBe(true);
    expect(bateComPesquisa(alvo, "macbml0092")).toBe(true);
    expect(bateComPesquisa(alvo, "BML0092")).toBe(true);
    expect(bateComPesquisa(base, "DBBD-0098")).toBe(true);
    expect(bateComPesquisa(base, "dbbd 0098")).toBe(true);
    expect(bateComPesquisa(base, "MACBML0092")).toBe(false);
  });
  it("menos de 3 letras e algarismos não chega para procurar pela referência sem traços", () => {
    const x = movel("x", "Móvel Branco", "ZQ1");
    expect(bateComPesquisa(x, "Z-Q")).toBe(false);
    expect(bateComPesquisa(x, "Z-Q-1")).toBe(true);
  });
  it("a referência igual vem primeiro, depois a parte da referência, depois o nome", () => {
    const outro = movel("o", "MACBML0092 Móvel parecido", "XPTO1");
    const parte = movel("p", "Móvel AXIS 2", "MACBML00921");
    expect(grauDaPesquisa(alvo, "MACBML0092")).toBe(0);
    expect(grauDaPesquisa(parte, "MACBML0092")).toBe(1);
    expect(ordenarPorPesquisa([outro, parte, alvo], "MACBML0092").map((p) => p.id)).toEqual(["alvo", "p", "o"]);
  });
});

describe("os mais parecidos primeiro (caso real: Móvel AXIS Suspenso c/lavatório, MACBML0092)", () => {
  const alvo = movel("alvo", "Móvel AXIS Suspenso c/lavatório 60x50x36 2 Gav Fundo Reduzido", "MACBML0092",
    { atributos_resumo: `Largura: 60 cm · Altura: 50 cm · Profundidade: 36 cm · Material: MDF hidrófugo lacado · Puxador: integrado em alumínio · Montagem: suspensa · Cor da frente: Oak` });
  // dezenas de «Móvel AXIS Suspenso 60x50x36 - 1 Pio / 2 Gav c/Fundo Reduzido - …» importados
  const parecidos = ["Branco Brilho", "Branco Mate", "Cinza Brilho", "Cinza Mate", "Preto Mate", "Carvalho", "Nogueira", "Antracite"]
    .flatMap((cor, i) => [
      movel(`a${i}`, `Móvel AXIS Suspenso 60x50x36 - 1 Pio / 2 Gav c/Fundo Reduzido - ${cor}`, `MACBML01${i}0`),
      movel(`b${i}`, `Móvel AXIS Suspenso 60x50x36 - 2 Gav c/Fundo Reduzido - ${cor}`, `MACBML01${i}1`),
    ]);
  const todos = [...parecidos, alvo];

  it("com o nome quase inteiro, ele é o primeiro", () => {
    const q = "Móvel AXIS Suspenso c/lavatório 60x50x36";
    const r = ordenarPorPesquisa(todos.filter((p) => bateComPesquisa(p, q)), q);
    expect(r[0].id).toBe("alvo");
  });
  it("com as palavras que todos têm, o nome mais curto (o mais exato) vem primeiro", () => {
    const q = "AXIS Suspenso 2 Gav Fundo Reduzido";
    const r = ordenarPorPesquisa(todos.filter((p) => bateComPesquisa(p, q)), q);
    expect(r).toHaveLength(todos.length);
    expect(r[0].id).toBe("alvo");
    // os de nome igual ao começo, por tamanho
    for (let i = 1; i < r.length; i++) expect(r[i - 1].n.length <= r[i].n.length || grauDaPesquisa(r[i - 1], q) < grauDaPesquisa(r[i], q)).toBe(true);
  });
  it("pelo atributo «Cor da frente: Oak», mesmo depois dos 120 caracteres do destaque", () => {
    expect(alvo.destaque!.length).toBeLessThanOrEqual(120);
    expect(alvo.destaque).not.toContain("Oak");
    expect(bateComPesquisa(alvo, "Oak")).toBe(true);
    expect(bateComPesquisa(alvo, "AXIS oak")).toBe(true);
    // o que só bate pelos atributos fica depois dos que batem pelo nome
    expect(grauDaPesquisa(alvo, "oak")).toBe(5);
  });
  it("pela subcategoria e pela marca", () => {
    expect(bateComPesquisa(alvo, "móveis de lavatório")).toBe(true);
  });
});

describe("a procura no catálogo da empresa, por páginas", () => {
  beforeEach(async () => {
    srv.chamadasNova = []; srv.chamadasAntiga = [];
    await carregarProdutosDoEstudio("org");
    srv.chamadasAntiga = [];
  });

  it("com a função nova: uma só leitura para as subcategorias, e «Ver mais» chega às páginas seguintes", async () => {
    srv.novaExiste = true;
    const r1 = await procurarNoCatalogoReal("movel", "AXIS");
    expect(r1).toEqual({ novos: 1, haMais: true });
    expect(srv.chamadasNova).toEqual([{ q: "AXIS", subs: ["sub-moveis"], pagina: 1 }]);
    const r2 = await procurarNoCatalogoReal("movel", "AXIS", 2);
    const r3 = await procurarNoCatalogoReal("movel", "AXIS", 3);
    expect(r2).toEqual({ novos: 1, haMais: true });
    expect(r3).toEqual({ novos: 1, haMais: false });
    expect(produtosReais().map((p) => p.id)).toEqual(expect.arrayContaining(["novo-1", "novo-2", "novo-3"]));
    expect(srv.chamadasAntiga).toEqual([]);
  });

  it("sem a função nova na base: lê como antes (página a página) e não volta a tentar a nova", async () => {
    srv.novaExiste = false;
    const r1 = await procurarNoCatalogoReal("movel", "AXIS");
    expect(r1).toEqual({ novos: 1, haMais: true });
    const r2 = await procurarNoCatalogoReal("movel", "AXIS", 2);
    expect(r2).toEqual({ novos: 1, haMais: false });
    expect(srv.chamadasAntiga).toEqual([{ sub: "sub-moveis", q: "AXIS", pagina: 1 }, { sub: "sub-moveis", q: "AXIS", pagina: 2 }]);
    expect(srv.chamadasNova).toHaveLength(1);
    expect(produtosReais().map((p) => p.id)).toEqual(expect.arrayContaining(["antigo-1", "antigo-2"]));
  });

  it("sem tipo de peça no catálogo verdadeiro ou com menos de 2 letras: nada", async () => {
    expect(await procurarNoCatalogoReal("sanita", "glamic")).toEqual({ novos: 0, haMais: false });
    expect(await procurarNoCatalogoReal("movel", "a")).toEqual({ novos: 0, haMais: false });
  });
});
