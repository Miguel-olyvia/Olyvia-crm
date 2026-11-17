// 16/11: o Catálogo por páginas (migration 20270118500000): a leitura dos produtos de 50 em 50, as contagens, os atributos de um produto e as
// definições. Aqui só os argumentos que vão à base e a forma em que a resposta é aceite; o ecrã está em CatalogoProdutosPagina.test.tsx.
import { beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string, a: Record<string, unknown>) => unknown,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f, a); }) },
}));

import { argsPagina, argsPesquisa, lerAtributosProduto, lerModeloDoProduto, lerProdutosContagens, lerProdutosPagina, paginaDe, contagensDe, SEM_FILTRO_SERVIDOR, POR_PAGINA_SERVIDOR } from "./produtosPaginados";

const ORG = "11111111-1111-4111-a111-111111111111";
const P1 = "88888888-8888-4888-a888-888888888881";
const linha = (id: string, extra: Record<string, unknown> = {}) => ({ id, nome: "Base " + id.slice(-1), sku: "B-1", sku_gerado: true, marca: "Roca", categoria_id: null, categoria: null,
  subcategoria_id: null, subcategoria: null, modelo_id: null, modelo: null, modelo_numero: null, unidade: "un", custo: 10, pvp: 20, fornecedor: "F", ativo: true, imagem: null, atributos_resumo: "", ...extra });

beforeEach(() => { base.chamadas = []; base.responder = () => ({ data: null, error: null }); });

describe("argsPagina", () => {
  it("sem filtros: tudo a null, 50 por página, página 1", () => {
    expect(argsPagina(ORG, SEM_FILTRO_SERVIDOR, 1)).toEqual({ p_org: ORG, p_q: null, p_categoria: null, p_subcategoria: null, p_modelo: null, p_marca: null, p_sem_categoria: false, p_limite: POR_PAGINA_SERVIDOR, p_pagina: 1 });
    expect(POR_PAGINA_SERVIDOR).toBe(50);
  });
  it("a pesquisa vai sem espaços de fora; vazia ou só espaços vai a null", () => {
    expect(argsPagina(ORG, { ...SEM_FILTRO_SERVIDOR, q: "  grohe  " }, 1).p_q).toBe("grohe");
    expect(argsPagina(ORG, { ...SEM_FILTRO_SERVIDOR, q: "   " }, 1).p_q).toBeNull();
  });
  it("leva cada filtro no seu argumento e a página pedida", () => {
    const a = argsPagina(ORG, { q: "x", categoria: "c", subcategoria: "s", modelo: "m", marca: "Roca", semCategoria: false }, 7);
    expect(a).toMatchObject({ p_q: "x", p_categoria: "c", p_subcategoria: "s", p_modelo: "m", p_marca: "Roca", p_sem_categoria: false, p_pagina: 7 });
  });
  it("«sem categoria» leva p_sem_categoria e nenhuma categoria nem subcategoria", () => {
    const a = argsPagina(ORG, { ...SEM_FILTRO_SERVIDOR, categoria: "c", subcategoria: "s", semCategoria: true }, 1);
    expect(a).toMatchObject({ p_sem_categoria: true, p_categoria: null, p_subcategoria: null });
  });
});

describe("lerProdutosPagina", () => {
  it("chama cat_ler_produtos_pagina e devolve a página", async () => {
    base.responder = () => ({ data: { total: 120, pagina: 2, limite: 50, paginas: 3, produtos: [linha(P1)] }, error: null });
    const r = await lerProdutosPagina(ORG, SEM_FILTRO_SERVIDOR, 2);
    expect(base.chamadas.map((c) => c.f)).toEqual(["cat_ler_produtos_pagina"]);
    expect(base.chamadas[0].a).toMatchObject({ p_org: ORG, p_pagina: 2, p_limite: 50 });
    expect(r).toMatchObject({ ok: true, v: { total: 120, pagina: 2, paginas: 3 } });
    expect(r.ok && r.v.produtos[0].id).toBe(P1);
  });
  it("erro da base: mensagem curta; função por criar: «Ainda não disponível nesta base»", async () => {
    base.responder = () => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } });
    expect(await lerProdutosPagina(ORG, SEM_FILTRO_SERVIDOR, 1)).toEqual({ ok: false, erro: "canceling statement due to statement timeout" });
    base.responder = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    expect(await lerProdutosPagina(ORG, SEM_FILTRO_SERVIDOR, 1)).toEqual({ ok: false, erro: "Ainda não disponível nesta base" });
  });
  it("resposta num formato que não é uma página, ou exceção: erro, nunca um ecrã preso", async () => {
    base.responder = () => ({ data: { total: 1 }, error: null });
    expect((await lerProdutosPagina(ORG, SEM_FILTRO_SERVIDOR, 1)).ok).toBe(false);
    base.responder = () => { throw new Error("rede em baixo"); };
    expect(await lerProdutosPagina(ORG, SEM_FILTRO_SERVIDOR, 1)).toEqual({ ok: false, erro: "rede em baixo" });
  });
});

describe("paginaDe e contagensDe", () => {
  it("paginaDe ignora produtos sem id e põe números por omissão", () => {
    expect(paginaDe({ produtos: [linha(P1), { nome: "sem id" }, null] })).toMatchObject({ total: 1, pagina: 1, limite: 50, paginas: 1 });
    expect(paginaDe({ total: 0, pagina: 1, limite: 50, paginas: 0, produtos: [] })).toMatchObject({ total: 0, paginas: 0 });
    expect(paginaDe(null)).toBeNull();
    expect(paginaDe({ produtos: "x" })).toBeNull();
  });
  it("paginaDe mapeia grossista e distribuidor: número tal como vem, null quando é null ou falta (base antiga)", () => {
    const r = paginaDe({ produtos: [
      linha(P1, { grossista: 12.5, distribuidor: 0 }),
      linha("22222222-2222-4222-a222-222222222222", { grossista: null, distribuidor: null }),
      linha("33333333-3333-4333-a333-333333333333"),
    ] });
    expect(r?.produtos.map((x) => [x.grossista, x.distribuidor])).toEqual([[12.5, 0], [null, null], [null, null]]);
  });
  it("contagensDe põe listas vazias e zeros onde falta", () => {
    expect(contagensDe({ total: 9, por_categoria: [{ id: "c", n: 4 }, { n: 1 }], sem_marca: 2 })).toEqual({
      total: 9, porCategoria: { c: 4 }, porSubcategoria: {}, porModelo: {}, semReferencia: 0, semCategoria: 0, semMarca: 2,
    });
    expect(contagensDe(null)).toBeNull();
    expect(contagensDe({ total: "x" })).toBeNull();
  });
});

describe("lerProdutosContagens", () => {
  it("chama cat_ler_produtos_contagens com a pesquisa e a marca", async () => {
    base.responder = () => ({ data: { total: 5, por_categoria: [{ id: "c1", n: 3 }], por_subcategoria: [], por_modelo: [{ id: "m1", n: 2 }], sem_referencia: 1, sem_categoria: 2, sem_marca: 0 }, error: null });
    const r = await lerProdutosContagens(ORG, " roca ", "Roca");
    expect(base.chamadas[0]).toEqual({ f: "cat_ler_produtos_contagens", a: { p_org: ORG, p_q: "roca", p_marca: "Roca" } });
    expect(r).toMatchObject({ ok: true, v: { total: 5, porCategoria: { c1: 3 }, porModelo: { m1: 2 }, semReferencia: 1, semCategoria: 2 } });
  });
  it("sem pesquisa nem marca vai a null; erro devolve a mensagem", async () => {
    await lerProdutosContagens(ORG, "", "");
    expect(base.chamadas[0].a).toEqual({ p_org: ORG, p_q: null, p_marca: null });
    base.responder = () => ({ data: null, error: { message: "falhou" } });
    expect(await lerProdutosContagens(ORG, "", "")).toEqual({ ok: false, erro: "falhou" });
  });
});

describe("lerAtributosProduto", () => {
  it("chama cat_ler_atributos_produto e devolve os valores no formato de Produto.attrs", async () => {
    base.responder = () => ({ data: { valores: [{ atributo: "a1", opcao: "o1", valor: "Preto", medida: null }, { atributo: "a2", opcao: null, valor: "x", medida: null }, { opcao: "sem atributo" }] }, error: null });
    const r = await lerAtributosProduto(ORG, P1);
    expect(base.chamadas[0]).toEqual({ f: "cat_ler_atributos_produto", a: { p_org: ORG, p_produto: P1 } });
    expect(r).toEqual({ ok: true, v: [{ atributoId: "a1", opcaoId: "o1", valor: "Preto" }, { atributoId: "a2", valor: "x" }] });
  });
  it("um produto sem valores dá lista vazia; erro e formato errado dão erro", async () => {
    base.responder = () => ({ data: { valores: [] }, error: null });
    expect(await lerAtributosProduto(ORG, P1)).toEqual({ ok: true, v: [] });
    base.responder = () => ({ data: null, error: { message: "sem permissão" } });
    expect(await lerAtributosProduto(ORG, P1)).toEqual({ ok: false, erro: "sem permissão" });
    base.responder = () => ({ data: {}, error: null });
    expect((await lerAtributosProduto(ORG, P1)).ok).toBe(false);
  });
});

describe("lerModeloDoProduto (ficha aberta pelo endereço, sem passar pela lista)", () => {
  it("procura o produto pelo nome e devolve o modelo da linha com o mesmo id", async () => {
    base.responder = () => ({ data: { total: 2, pagina: 1, limite: 50, paginas: 1, produtos: [linha("x1"), linha(P1, { modelo_id: "m1", modelo: "SORTY", modelo_numero: 1 })] }, error: null });
    const r = await lerModeloDoProduto(ORG, P1, "Base 1");
    expect(base.chamadas[0].a).toMatchObject({ p_q: "Base 1", p_limite: 50, p_pagina: 1 });
    expect(r).toEqual({ ok: true, v: { modeloId: "m1", modelo: "SORTY", modeloNumero: 1 } });
  });
  it("produto sem modelo: v é null; produto que a procura não trouxe: v é undefined (não se sabe)", async () => {
    base.responder = () => ({ data: { total: 1, pagina: 1, limite: 50, paginas: 1, produtos: [linha(P1)] }, error: null });
    expect(await lerModeloDoProduto(ORG, P1, "Base 1")).toEqual({ ok: true, v: null });
    base.responder = () => ({ data: { total: 0, pagina: 1, limite: 50, paginas: 0, produtos: [] }, error: null });
    const r = await lerModeloDoProduto(ORG, P1, "Base 1");
    expect(r.ok && r.v).toBeUndefined();
  });
});

describe("pesquisa por serviço (cat_pesquisar_produtos, 20270122000000)", () => {
  it("argsPesquisa: p_pagina e p_limite, o serviço, e sem modelo, marca nem sem_categoria", () => {
    const a = argsPesquisa(ORG, { ...SEM_FILTRO_SERVIDOR, q: " cola ", servico: "s-1", categoria: "c", subcategoria: "sc" }, 3);
    expect(a).toEqual({ p_org: ORG, p_q: "cola", p_servico: "s-1", p_categoria: "c", p_subcategoria: "sc", p_pagina: 3, p_limite: POR_PAGINA_SERVIDOR });
    expect(argsPesquisa(ORG, SEM_FILTRO_SERVIDOR, 1)).toMatchObject({ p_q: null, p_servico: null, p_categoria: null, p_subcategoria: null });
  });
  it("com serviço chama cat_pesquisar_produtos e devolve servico_id e fator_servico da linha", async () => {
    base.responder = () => ({ data: { total: 1, pagina: 1, limite: 50, paginas: 1, produtos: [linha(P1, { servico_id: "s-1", fator_servico: 2 })] }, error: null });
    const r = await lerProdutosPagina(ORG, { ...SEM_FILTRO_SERVIDOR, servico: "s-1" }, 1);
    expect(base.chamadas.map((c) => c.f)).toEqual(["cat_pesquisar_produtos"]);
    expect(base.chamadas[0].a).toMatchObject({ p_servico: "s-1", p_pagina: 1, p_limite: 50 });
    expect(r.ok && r.v.produtos[0]).toMatchObject({ servico_id: "s-1", fator_servico: 2 });
  });
  it("sem serviço continua a chamar cat_ler_produtos_pagina", async () => {
    base.responder = () => ({ data: { total: 0, pagina: 1, limite: 50, paginas: 1, produtos: [] }, error: null });
    await lerProdutosPagina(ORG, SEM_FILTRO_SERVIDOR, 1);
    expect(base.chamadas.map((c) => c.f)).toEqual(["cat_ler_produtos_pagina"]);
  });
});

describe("M12: cat_pesquisar_produtos em falta na base", () => {
  it("cai para cat_ler_produtos_pagina, sem o filtro de serviço, e avisa", async () => {
    base.responder = (f) => (f === "cat_pesquisar_produtos"
      ? { data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_pesquisar_produtos(p_org) in the schema cache" } }
      : { data: { total: 1, pagina: 1, limite: 50, paginas: 1, produtos: [linha(P1)] }, error: null });
    const r = await lerProdutosPagina(ORG, { ...SEM_FILTRO_SERVIDOR, servico: "s-1" }, 1);
    expect(base.chamadas.map((c) => c.f)).toEqual(["cat_pesquisar_produtos", "cat_ler_produtos_pagina"]);
    expect(base.chamadas[1].a).not.toHaveProperty("p_servico");
    expect(r.ok && r.v.aviso).toMatch(/serviço/);
  });
  it("outro erro (tempo) não cai na outra função", async () => {
    base.responder = () => ({ data: null, error: { code: "57014", message: "statement timeout" } });
    const r = await lerProdutosPagina(ORG, { ...SEM_FILTRO_SERVIDOR, servico: "s-1" }, 1);
    expect(base.chamadas.map((c) => c.f)).toEqual(["cat_pesquisar_produtos"]);
    expect(r.ok).toBe(false);
  });
});
