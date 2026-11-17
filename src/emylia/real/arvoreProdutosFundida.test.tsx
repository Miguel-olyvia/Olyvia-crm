// 17/11 (revisão H1 e H2): o catálogo junta a árvore dos produtos (product_categories) à dos serviços pelo nome (juntarArvoreProdutos): uma categoria de produto com o
// mesmo nome que um ramo dos serviços fica NESSE ramo (outro id). O produto que chega por cat_ler_produto traz o id cru de product_categories, e a pesquisa por ramo tem de
// mandar ao servidor o id cru, não o do nó fundido.
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seed } from "../motor";
import { lerCustos, reporCustos } from "../v2/custosStore";
import { lerCatalogo, mudarCatalogo, reporCatalogo } from "../v2/catalogoStore";
import { carregarCatalogo } from "./carregarCatalogo";
import { aoRegistarProduto, limparCatalogoLido, linhaDeProduto } from "./catalogoLeve";
import { diferencasCatalogo, fotografar } from "./gravarCatalogo";
import { escolherProdutoDoServidor, filtroDoRamo, produtoDeLinha, useProdutosDoRamo } from "./pesquisaProdutos";

const ORG = "11111111-1111-4111-a111-111111111111";
const ID = { svc: "55555555-5555-4555-a555-555555555555", S1: "66666666-6666-4666-a666-666666666601", S2: "66666666-6666-4666-a666-666666666602",
  P1: "77777777-7777-4777-a777-777777777701", P2: "77777777-7777-4777-a777-777777777702", PX: "77777777-7777-4777-a777-777777777703", prod: "88888888-8888-4888-a888-888888888888" };

const CATALOGO_LEVE = {
  parametros: { meses: 14, tsu: 23.75, seguros_ano: 713, horas_ano: 1345, horas_mes: 672, meses_desatualizado: 6, margem_minima: 28, margem_alvo: 35 },
  categorias: [{ id: ID.S1, name: "Sanitários", parent_id: null, sort_order: 0 }, { id: ID.S2, name: "Sanitas", parent_id: ID.S1, sort_order: 0 }],
  servicos: [{ id: ID.svc, chave: "inst", name: "Instalação de sanita", sku: "inst", unidade: "un", service_category_id: ID.S1, service_subcategory_id: ID.S2, linhas: ["wc"],
    medida: null, modo_preco: "tabela", margem: 35, justificacao_preco: null, fases: [1], receita_origem: "catalogo", icone: null, exige_produto_categoria_id: null,
    exige_produto_medida: null, exige_produto_fator: null, exige_produto_arredondar: false, pergunta_manter: null, entulho_modo: null, entulho_m3: null, entulho_kg: null }],
  precosServico: [{ service_id: ID.svc, price: 100, valid_from: "2026-01-15", nota: null, vat_rate: null, created_at: null }],
};
// as categorias dos PRODUTOS: «Sanitários»/«Sanitas» têm o nome dos ramos dos serviços (fundem-se); «Acessórios» não (fica como ramo só de produtos)
const TABELAS = { categoriasProduto: [
  { id: ID.P1, name: "Sanitários", parent_id: null, sort_order: 0 }, { id: ID.P2, name: "Sanitas", parent_id: ID.P1, sort_order: 0 }, { id: ID.PX, name: "Acessórios", parent_id: null, sort_order: 1 },
], marcas: [], unidades: [], exige: [], produtos: [] };
// o que cat_ler_produto devolve: os ids CRUS de product_categories
const RAW = { id: ID.prod, name: "Sanita suspensa", category_id: ID.P1, subcategory_id: ID.P2, unidade: "un", uom: "un", custo: 80, pvp: 150, marca: "Roca", fornecedor: "Roca PT", custo_data: "2026-11-01", ve_valores: true };

const pagina = vi.fn();
vi.mock("./produtosPaginados", async (orig) => ({ ...(await orig<typeof import("./produtosPaginados")>()), lerProdutosPagina: (...a: unknown[]) => pagina(...a) }));
vi.mock("./produtosLeves", async (orig) => {
  const m = await orig<typeof import("./produtosLeves")>();
  return { ...m, lerProdutoFicha: async () => { const v = m.produtoDeLeitura(RAW); return v ? { ok: true as const, v } : { ok: false as const, erro: "x" }; } };
});

const sb = { rpc: async (fn: string) => {
  if (fn === "cat_ler_catalogo_servicos") return { data: CATALOGO_LEVE, error: null };
  if (fn === "cat_ler_produtos_tabelas" || fn === "cat_ler_produtos_tabelas_servicos") return { data: TABELAS, error: null };
  return { data: null, error: { message: "sem função" } };
} } as never;

beforeEach(() => { pagina.mockReset(); });
afterEach(() => { reporCustos(); reporCatalogo(); limparCatalogoLido(); });

describe("H1: o produto que vem do servidor entra no Catálogo com o nó FUNDIDO da árvore", () => {
  it("o `no` do produto é o ramo dos serviços (não o id cru de product_categories) e o autosave grava a categoria certa", async () => {
    const S = seed();
    const c = await carregarCatalogo(sb, ORG, S, { leve: true });
    const sai = aoRegistarProduto((p) => { c.foto.K.produtos.push(p); c.produtos.push(linhaDeProduto(p)); });
    const r = await escolherProdutoDoServidor(ORG, ID.prod);
    sai();
    expect(r.ok && r.v.no).toBe(ID.S2); // o nó fundido, não ID.P2
    expect(lerCatalogo().produtos.find((p) => p.id === ID.prod)?.no).toBe(ID.S2);
    mudarCatalogo((k) => { const y = k.produtos.find((p) => p.id === ID.prod)!; y.servico = "inst"; y.fatorServico = 1; });
    const depois = fotografar({ C: lerCustos(), K: lerCatalogo(), svc: S.svc, margens: { min: S.cfg.min, alvo: S.cfg.alvo } });
    const out = diferencasCatalogo(ORG, c.foto, depois, { ids: c.M.ids, produtos: c.produtos });
    const g = out.filter((x) => x.rpc === "cat_guardar_produto");
    expect(g).toHaveLength(1);
    expect(g[0].args.p_id).toBe(ID.prod);
    expect(g[0].args.p_categoria_id).toBe(ID.S2);
    const t = out.find((x) => x.rpc === "cat_guardar_produto_tabelas");
    expect(t?.args).toMatchObject({ p_categoria: "Sanitários", p_subcategoria: "Sanitas" });
    expect(JSON.stringify(out)).not.toContain('"tmp":"no:');
  });
  it("uma categoria só de produtos (sem par nos serviços) fica com o próprio id", async () => {
    await carregarCatalogo(sb, ORG, seed(), { leve: true });
    expect(produtoDeLinha({ id: "x", nome: "Cabide", sku: null, sku_gerado: null, marca: null, categoria_id: ID.PX, categoria: null, subcategoria_id: null, subcategoria: null, modelo_id: null, modelo: null,
      modelo_numero: null, unidade: "un", custo: 1, pvp: 2, grossista: null, distribuidor: null, fornecedor: null, ativo: true, imagem: null, atributos_resumo: null }).no).toBe(ID.PX);
  });
  it("a linha da pesquisa (cartões) também traz o nó fundido", async () => {
    await carregarCatalogo(sb, ORG, seed(), { leve: true });
    const l = { id: "x", nome: "Sanita", sku: null, sku_gerado: null, marca: null, categoria_id: ID.P1, categoria: "Sanitários", subcategoria_id: ID.P2, subcategoria: "Sanitas", modelo_id: null, modelo: null,
      modelo_numero: null, unidade: "un", custo: 1, pvp: 2, grossista: null, distribuidor: null, fornecedor: null, ativo: true, imagem: null, atributos_resumo: null };
    expect(produtoDeLinha(l).no).toBe(ID.S2);
  });
});

describe("H2: a pesquisa por ramo manda ao servidor o id de product_categories", () => {
  it("o ramo fundido converte-se no id cru: o sub na subcategoria, o de topo na categoria", async () => {
    const c = await carregarCatalogo(sb, ORG, seed(), { leve: true });
    expect(filtroDoRamo(c.M.K.arvore, ID.S2)).toEqual({ subcategoria: ID.P2 });
    expect(filtroDoRamo(c.M.K.arvore, ID.S1)).toEqual({ categoria: ID.P1 });
    expect(filtroDoRamo(c.M.K.arvore, ID.PX)).toEqual({ categoria: ID.PX }); // ramo só de produtos: o id é o mesmo
  });
  it("um ramo fundido devolve os produtos (o servidor só conhece o id cru)", async () => {
    pagina.mockImplementation(async (_o: string, f: { categoria: string; subcategoria: string }) => ({ ok: true, v: { total: 1, pagina: 1, limite: 50, paginas: 1,
      produtos: f.subcategoria === ID.P2 ? [{ id: "p1", nome: "Sanita suspensa", sku: null, sku_gerado: null, marca: null, categoria_id: ID.P1, categoria: null, subcategoria_id: ID.P2, subcategoria: null,
        modelo_id: null, modelo: null, modelo_numero: null, unidade: "un", custo: 1, pvp: 2, grossista: null, distribuidor: null, fornecedor: null, ativo: true, imagem: null, atributos_resumo: null }] : [] } }));
    const c = await carregarCatalogo(sb, ORG, seed(), { leve: true });
    const { result } = renderHook(() => useProdutosDoRamo(ORG, c.M.K.arvore, ID.S2, ""));
    await waitFor(() => expect(result.current.produtos).toHaveLength(1));
    expect(pagina).toHaveBeenCalledWith(ORG, expect.objectContaining({ subcategoria: ID.P2 }), 1);
  });
});
