// O `modelo3d` (string ou null) que as leituras do catálogo passam a trazer em cada produto e em cada categoria/subcategoria. A migração ainda não está
// aplicada: sem a chave, nada muda (undefined → null/ausente) e nenhum teste de leitura de hoje se altera.
import { describe, expect, it } from "vitest";
import { catalogo0 } from "../v2/catalogoModelo";
import { montarCatalogo, type LinhasCatalogo } from "./catalogoReal";
import { juntarTabelas, linhasDe } from "./lerCatalogo";
import { produtoDeLeitura } from "./produtosLeves";

const ID = {
  svc: "55555555-5555-4555-a555-555555555555", of: "66666666-6666-4666-a666-666666666666", sub: "77777777-7777-4777-a777-777777777777", prod: "88888888-8888-4888-a888-888888888888",
  pcOf: "aaaaaaaa-0000-4000-a000-000000000001", pcSub: "aaaaaaaa-0000-4000-a000-000000000002", pcSan: "aaaaaaaa-0000-4000-a000-000000000003", pcLav: "aaaaaaaa-0000-4000-a000-000000000004",
};

function linhas(): LinhasCatalogo {
  return linhasDe({
    categorias: [{ id: ID.of, name: "Canalização", parent_id: null, sort_order: 0 }, { id: ID.sub, name: "Louças e torneiras", parent_id: ID.of, sort_order: 0 }],
    perfis: [], equipamentos: [], estrutura: [], precosServico: [], passos: [], usosEquip: [], usosCons: [], fornecedores: [], tecnicos: [], servicos: [],
    produtos: [{ id: ID.prod, name: "Torneira", sku: "T-1", tipo_catalogo: "produto", unidade: "UN", catalogo_categoria_id: ID.sub, servico_id: null, fator_servico: 1,
      entulho_m3: null, entulho_kg: null, short_description: null, marca_livre: "GROHE", fornecedor_livre: null }],
    precosProduto: [],
  });
}
const resposta = (com: boolean) => ({
  produtos: [{ id: ID.prod, brand_id: "b1", marca: "Grohe", uom_id: "u1", uom: "un", category_id: ID.pcOf, subcategory_id: ID.pcSub, ...(com ? { modelo3d: "bide" } : {}) }],
  categoriasProduto: [
    { id: ID.pcOf, name: "Canalização", parent_id: null, sort_order: 0, ...(com ? { modelo3d: "banheira" } : {}) },
    { id: ID.pcSub, name: "Louças e torneiras", parent_id: ID.pcOf, sort_order: 0, ...(com ? { modelo3d: "sanita" } : {}) },
    { id: ID.pcSan, name: "Sanitários", parent_id: null, sort_order: 1, ...(com ? { modelo3d: null } : {}) },
    { id: ID.pcLav, name: "Lavatórios", parent_id: ID.pcSan, sort_order: 0 },
  ],
  marcas: ["Grohe"], unidades: ["un"], exige: [],
});
const montar = (com: boolean) => montarCatalogo(juntarTabelas(linhas(), resposta(com)), catalogo0(), {}).K;

describe("a árvore do Catálogo e o produto trazem modelo3d", () => {
  it("o ramo que se junta ao dos serviços pelo nome leva o modelo da categoria de produto, e os ramos só de produtos também", () => {
    const K = montar(true);
    expect(K.arvore.find((x) => x.id === ID.of)?.modelo3d).toBe("banheira");
    expect(K.arvore.find((x) => x.id === ID.sub)?.modelo3d).toBe("sanita");
    // um ramo só de produtos sem escolha (null na base) fica sem a chave, como um sem valor
    expect(K.arvore.find((x) => x.id === ID.pcSan)?.modelo3d ?? null).toBeNull();
    expect(K.arvore.find((x) => x.id === ID.pcLav)?.modelo3d ?? null).toBeNull();
  });
  it("K.categoriasProduto (origem = o id em product_categories) leva o modelo3d", () => {
    const c = montar(true).categoriasProduto!;
    expect(c.find((x) => x.origem === ID.pcOf)?.modelo3d).toBe("banheira");
    expect(c.find((x) => x.origem === ID.pcSub)?.modelo3d).toBe("sanita");
  });
  it("o produto leva o seu modelo3d", () => {
    expect(montar(true).produtos.find((p) => p.id === ID.prod)?.modelo3d).toBe("bide");
  });
  it("sem as chaves (migração por aplicar): nenhum nó nem produto ganha o campo — o resultado é o de hoje", () => {
    const K = montar(false);
    for (const x of K.arvore) expect("modelo3d" in x).toBe(false);
    for (const x of K.categoriasProduto!) expect("modelo3d" in x).toBe(false);
    for (const p of K.produtos) expect("modelo3d" in p).toBe(false);
  });
  it("um valor que não é texto no formato da base (lixo) é ignorado", () => {
    const r = resposta(true);
    (r.produtos[0] as Record<string, unknown>).modelo3d = 42;
    (r.categoriasProduto[0] as Record<string, unknown>).modelo3d = "Com Espaços";
    const K = montarCatalogo(juntarTabelas(linhas(), r), catalogo0(), {}).K;
    expect(K.produtos[0].modelo3d).toBeUndefined();
    expect(K.arvore.find((x) => x.id === ID.of)?.modelo3d).toBeUndefined();
  });
});

describe("a ficha (cat_ler_produto)", () => {
  const base = { id: ID.prod, name: "Torneira", custo: 10, uom: "un" };
  it("traz o modelo3d do produto", () => {
    expect(produtoDeLeitura({ ...base, modelo3d: "bide" })?.modelo3d).toBe("bide");
  });
  it("sem a chave, null ou lixo: o produto não tem o campo", () => {
    for (const v of [undefined, null, "", 7, "A B"]) expect(produtoDeLeitura({ ...base, ...(v === undefined ? {} : { modelo3d: v }) })?.modelo3d).toBeUndefined();
  });
});
