// 13/11 (20270117100000): os produtos do Catálogo pela marca (brands), pela unidade (uom) e pela árvore dos produtos
// (product_categories), lidos por cat_ler_produtos_tabelas e gravados por cat_guardar_produto_tabelas e cat_guardar_servico_exige.
// O motor continua com uma só árvore: a dos produtos junta-se à dos serviços pelo nome.
import { describe, expect, it } from "vitest";
import { catalogo0 } from "../v2/catalogoModelo";
import { nosAbaixo } from "../produtosVisita";
import { juntarArvoreProdutos, montarCatalogo, type LinhasCatalogo } from "./catalogoReal";
import { juntarTabelas, linhasDe } from "./lerCatalogo";
import { diferencasCatalogo, fotografar, type FotoCatalogo } from "./gravarCatalogo";

const ORG = "11111111-1111-4111-a111-111111111111";
const ID = {
  svc: "55555555-5555-4555-a555-555555555555", of: "66666666-6666-4666-a666-666666666666", sub: "77777777-7777-4777-a777-777777777777",
  prod: "88888888-8888-4888-a888-888888888888", imp: "99999999-9999-4999-a999-999999999991", cons: "44444444-4444-4444-a444-444444444444",
  // árvore dos produtos: Canalização › Louças e torneiras (os mesmos nomes da dos serviços) e Sanitários › Lavatórios (só de produtos)
  pcOf: "aaaaaaaa-0000-4000-a000-000000000001", pcSub: "aaaaaaaa-0000-4000-a000-000000000002",
  pcSan: "aaaaaaaa-0000-4000-a000-000000000003", pcLav: "aaaaaaaa-0000-4000-a000-000000000004",
};

function linhasBase(): LinhasCatalogo {
  return linhasDe({
    categorias: [{ id: ID.of, name: "Canalização", parent_id: null, sort_order: 0 }, { id: ID.sub, name: "Louças e torneiras", parent_id: ID.of, sort_order: 0 }],
    perfis: [], equipamentos: [], estrutura: [], precosServico: [], passos: [], usosEquip: [], fornecedores: [], tecnicos: [],
    servicos: [{ id: ID.svc, chave: "loucas", name: "Instalar louças", sku: null, unidade: "un", service_category_id: ID.of, service_subcategory_id: ID.sub,
      linhas: ["wc"], medida: null, modo_preco: "tabela", margem: 35, justificacao_preco: null, fases: [], receita_origem: "catalogo", icone: null,
      exige_produto_categoria_id: ID.sub, exige_produto_medida: "fixo", exige_produto_fator: 1, exige_produto_arredondar: false, pergunta_manter: null,
      entulho_modo: null, entulho_m3: null, entulho_kg: null }],
    usosCons: [{ service_id: ID.svc, product_id: ID.cons, quantity: 1, opcional: false, sort_order: 0 }],
    produtos: [
      { id: ID.prod, name: "Torneira", sku: "T-1", tipo_catalogo: "produto", unidade: "UN", catalogo_categoria_id: ID.sub, servico_id: null, fator_servico: 1,
        entulho_m3: null, entulho_kg: null, short_description: null, marca_livre: "GROHE", fornecedor_livre: null },
      // o produto importado pelo Miguel: só ids (sem marca_livre nem ramo dos serviços)
      { id: ID.imp, name: "Lavatório suspenso", sku: "L-9", tipo_catalogo: "produto", unidade: null, catalogo_categoria_id: null, servico_id: null, fator_servico: 1,
        entulho_m3: null, entulho_kg: null, short_description: null, marca_livre: null, fornecedor_livre: null },
      { id: ID.cons, name: "Silicone", sku: "C-1", tipo_catalogo: "consumivel", unidade: "un", catalogo_categoria_id: null, servico_id: null, fator_servico: 1,
        entulho_m3: null, entulho_kg: null, short_description: null, marca_livre: null, fornecedor_livre: null },
    ],
    precosProduto: [],
  });
}
const RESPOSTA_TABELAS = {
  produtos: [
    { id: ID.prod, brand_id: "b1", marca: "Grohe", uom_id: "u1", uom: "un", category_id: ID.pcOf, subcategory_id: ID.pcSub },
    { id: ID.imp, brand_id: "b2", marca: "Roca", uom_id: "u1", uom: "un", category_id: ID.pcSan, subcategory_id: ID.pcLav },
    { id: ID.cons, brand_id: null, marca: null, uom_id: "u2", uom: "cartucho", category_id: null, subcategory_id: null },
  ],
  categoriasProduto: [
    { id: ID.pcOf, name: "canalização", parent_id: null, sort_order: 0 }, { id: ID.pcSub, name: "Louças  e torneiras", parent_id: ID.pcOf, sort_order: 0 },
    { id: ID.pcSan, name: "Sanitários", parent_id: null, sort_order: 1 }, { id: ID.pcLav, name: "Lavatórios", parent_id: ID.pcSan, sort_order: 0 },
  ],
  marcas: ["Grohe", "Roca", "Sanindusa"],
  unidades: ["un", "m²", "cartucho"],
  exige: [{ service_id: ID.svc, categoria_produto_id: ID.pcSan }],
};
const linhas = () => juntarTabelas(linhasBase(), RESPOSTA_TABELAS);
const montar = (L = linhas()) => montarCatalogo(L, catalogo0(), {});
const foto = (M: ReturnType<typeof montar>): FotoCatalogo => fotografar({ C: M.C, K: M.K, svc: M.svc, margens: M.margens });

describe("juntarArvoreProdutos: a árvore dos produtos junta-se à dos serviços pelo nome", () => {
  it("o mesmo nome (sem contar maiúsculas e espaços) cai no ramo dos serviços; o resto entra como só de produtos", () => {
    const { extra, noDe } = juntarArvoreProdutos(
      [{ id: ID.of, n: "Canalização", pai: null }, { id: ID.sub, n: "Louças e torneiras", pai: ID.of }], RESPOSTA_TABELAS.categoriasProduto);
    expect(noDe(ID.pcOf)).toBe(ID.of);
    expect(noDe(ID.pcSub)).toBe(ID.sub);
    expect(noDe(ID.pcLav)).toBe(ID.pcLav);
    expect(extra).toEqual([{ id: ID.pcSan, n: "Sanitários", pai: null, soProduto: true }, { id: ID.pcLav, n: "Lavatórios", pai: ID.pcSan, soProduto: true }]);
    expect(noDe("desconhecida")).toBeNull();
  });
  it("uma sub só de produtos debaixo de um ofício dos serviços fica nesse ofício", () => {
    const { extra, noDe } = juntarArvoreProdutos([{ id: ID.of, n: "Canalização", pai: null }],
      [{ id: ID.pcOf, name: "Canalização", parent_id: null, sort_order: 0 }, { id: ID.pcSub, name: "Torneiras", parent_id: ID.pcOf, sort_order: 0 }]);
    expect(noDe(ID.pcSub)).toBe(ID.pcSub);
    expect(extra).toEqual([{ id: ID.pcSub, n: "Torneiras", pai: ID.of, soProduto: true }]);
  });
});

describe("montarCatalogo com as tabelas (cat_ler_produtos_tabelas)", () => {
  it("marca, unidade e categoria vêm das tabelas, não do texto", () => {
    const K = montar().K;
    const t = K.produtos.find((p) => p.id === ID.prod)!;
    expect(t).toMatchObject({ marca: "Grohe", un: "un", no: ID.sub });
    const imp = K.produtos.find((p) => p.id === ID.imp)!;
    expect(imp).toMatchObject({ marca: "Roca", un: "un", no: ID.pcLav });
    expect(K.consumiveisCriados).toEqual([]); // o consumível é usado na receita
    expect(montar().C.receitas.loucas.cons[0]).toMatchObject({ id: ID.cons, un: "cartucho" });
  });
  it("a árvore tem os ramos só de produtos e a regra «exige produto» vai pela árvore dos produtos", () => {
    const K = montar().K;
    expect(K.arvore.find((x) => x.id === ID.pcSan)).toEqual({ id: ID.pcSan, n: "Sanitários", pai: null, soProduto: true });
    expect(K.exigeProduto?.loucas).toBe(ID.pcSan);
    expect(K.qtdDe?.loucas).toEqual({ k: "fixo", q: 1 });
    // o motor encontra o produto importado no ramo exigido
    const ramo = nosAbaixo(K.arvore, K.exigeProduto!.loucas);
    expect(K.produtos.filter((p) => p.no && ramo.has(p.no)).map((p) => p.id)).toEqual([ID.imp]);
  });
  it("as marcas e as unidades das tabelas entram nas listas", () => {
    const K = montar().K;
    expect(K.marcas).toEqual(expect.arrayContaining(["Grohe", "Roca", "Sanindusa"]));
    expect(K.unidades).toEqual(expect.arrayContaining(["un", "m²", "cartucho"]));
  });
  it("sem a função na base (resposta vazia ou de outro formato) fica tudo como antes, pelo texto", () => {
    for (const r of [null, { produtos: [] }]) {
      const L = juntarTabelas(linhasBase(), r);
      expect(L.tabelas).toBeUndefined();
      const M = montar(L);
      expect(M.ids.tabelas).toBeUndefined();
      expect(M.K.produtos.find((p) => p.id === ID.prod)).toMatchObject({ marca: "GROHE", un: "UN", no: ID.sub });
      expect(M.K.exigeProduto?.loucas).toBe(ID.sub);
    }
  });
  it("produto sem categoria de produto (ainda por preencher) cai no ramo antigo", () => {
    const L = linhas();
    L.produtos[0] = { ...L.produtos[0], category_id: null, subcategory_id: null };
    expect(montar(L).K.produtos.find((p) => p.id === ID.prod)?.no).toBe(ID.sub);
  });
});

describe("diferencasCatalogo com as tabelas", () => {
  it("sem mudanças, nenhuma chamada", () => {
    const M = montar();
    expect(diferencasCatalogo(ORG, foto(M), foto(M), { ids: M.ids, produtos: linhas().produtos })).toEqual([]);
  });
  it("mudar a marca, a unidade e o ramo de um produto grava pelas tabelas, pelo nome do ramo", () => {
    const M = montar(), antes = foto(M), depois = foto(M);
    const p = depois.K.produtos.find((x) => x.id === ID.prod)!;
    p.marca = "Sanindusa"; p.un = "m²"; p.no = ID.pcLav;
    const ch = diferencasCatalogo(ORG, antes, depois, { ids: M.ids, produtos: linhas().produtos });
    expect(ch.map((c) => c.rpc)).toEqual(["cat_guardar_produto", "cat_guardar_produto_texto", "cat_guardar_produto_tabelas"]);
    // o ramo só de produtos não existe em service_categories: a coluna antiga fica vazia
    expect(ch[0].args).toMatchObject({ p_id: ID.prod, p_categoria_id: null, p_unidade: "m²" });
    expect(ch[2].args).toEqual({ p_org: ORG, p_id: ID.prod, p_marca: "Sanindusa", p_unidade: "m²", p_categoria: "Sanitários", p_subcategoria: "Lavatórios" });
  });
  it("um produto num ramo com o mesmo nome nos serviços também acerta a coluna antiga", () => {
    const M = montar(), antes = foto(M), depois = foto(M);
    depois.K.produtos.find((x) => x.id === ID.imp)!.no = ID.sub;
    const ch = diferencasCatalogo(ORG, antes, depois, { ids: M.ids, produtos: linhas().produtos });
    expect(ch[0].args).toMatchObject({ p_id: ID.imp, p_categoria_id: ID.sub });
    expect(ch.find((c) => c.rpc === "cat_guardar_produto_tabelas")?.args).toMatchObject({ p_categoria: "Canalização", p_subcategoria: "Louças e torneiras" });
  });
  it("um produto novo grava as tabelas com o id que a base der", () => {
    const M = montar(), antes = foto(M), depois = foto(M);
    depois.K.produtos.push({ id: "novo", n: "Base de duche", custo: 100, un: "un", marca: "Roca", fornecedor: "", data: "2026-11-13", no: ID.pcSan });
    const ch = diferencasCatalogo(ORG, antes, depois, { ids: M.ids, produtos: linhas().produtos });
    expect(ch.find((c) => c.rpc === "cat_guardar_produto_tabelas")?.args).toMatchObject({ p_id: { tmp: "prod:novo" }, p_marca: "Roca", p_categoria: "Sanitários", p_subcategoria: null });
  });
  it("o ramo exigido pelo serviço grava-se pela árvore dos produtos (e a coluna antiga só se o ramo for dos serviços)", () => {
    const M = montar(), antes = foto(M), depois = foto(M);
    depois.K.exigeProduto!.loucas = ID.pcLav;
    let ch = diferencasCatalogo(ORG, antes, depois, { ids: M.ids, produtos: linhas().produtos });
    expect(ch.find((c) => c.rpc === "cat_guardar_servico_detalhes")?.args).toMatchObject({ p_exige_categoria_id: null });
    expect(ch.find((c) => c.rpc === "cat_guardar_servico_exige")?.args).toEqual({ p_org: ORG, p_id: ID.svc, p_categoria: "Sanitários", p_subcategoria: "Lavatórios" });
    depois.K.exigeProduto!.loucas = ID.sub;
    ch = diferencasCatalogo(ORG, antes, depois, { ids: M.ids, produtos: linhas().produtos });
    expect(ch.find((c) => c.rpc === "cat_guardar_servico_detalhes")?.args).toMatchObject({ p_exige_categoria_id: ID.sub });
    delete depois.K.exigeProduto!.loucas;
    ch = diferencasCatalogo(ORG, antes, depois, { ids: M.ids, produtos: linhas().produtos });
    expect(ch.find((c) => c.rpc === "cat_guardar_servico_exige")?.args).toMatchObject({ p_categoria: null, p_subcategoria: null });
  });
  it("os ramos só de produtos não se gravam nem apagam na árvore dos serviços", () => {
    const M = montar(), antes = foto(M), depois = foto(M);
    depois.K.arvore = depois.K.arvore.filter((x) => x.id !== ID.pcLav).map((x) => (x.id === ID.pcSan ? { ...x, n: "Sanitários e louças" } : x));
    const ch = diferencasCatalogo(ORG, antes, depois, { ids: M.ids, produtos: linhas().produtos });
    expect(ch.filter((c) => c.rpc === "cat_guardar_categoria" || c.rpc === "cat_apagar_categoria")).toEqual([]);
  });
});
