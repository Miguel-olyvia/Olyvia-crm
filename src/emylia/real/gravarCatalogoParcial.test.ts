// 17/11: com a leitura LEVE (cat_ler_catalogo_servicos) K.produtos traz só os produtos dos consumos dos serviços. O autosave do Catálogo (diferencasCatalogo)
// compara o «antes» com o «depois», os dois lidos da mesma leitura parcial: um produto que nunca veio NÃO pode gerar chamadas (nem gravar, nem apagar).
// E um produto que entra no Catálogo vindo de uma pesquisa tem de entrar também no «antes» e na base, senão passa por produto NOVO e grava-se um duplicado.
import { describe, expect, it } from "vitest";
import { catalogo0 } from "../v2/catalogoModelo";
import { montarCatalogo, type LinhaProduto } from "./catalogoReal";
import { linhasDe } from "./lerCatalogo";
import { diferencasCatalogo, fotografar, type FotoCatalogo } from "./gravarCatalogo";

const ORG = "11111111-1111-4111-a111-111111111111";
const ID = { svc: "55555555-5555-4555-a555-555555555555", cons: "44444444-4444-4444-a444-444444444444", ausente: "88888888-8888-4888-a888-888888888888" };
const linhaProduto = (id: string, name: string, tipo = "produto"): LinhaProduto => ({
  id, name, sku: null, tipo_catalogo: tipo, unidade: "un", catalogo_categoria_id: null, servico_id: null, fator_servico: 1,
  entulho_m3: null, entulho_kg: null, short_description: null, marca_livre: null, fornecedor_livre: "Leroy",
});
// a resposta da leitura leve: só o produto consumido pelo serviço (o resto do catálogo, 29 785 na Mudelar, não vem)
const LEVE = linhasDe({
  parametros: { meses: 14, tsu: 23.75, seguros_ano: 713, horas_ano: 1345, horas_mes: 672, meses_desatualizado: 6, margem_minima: 28, margem_alvo: 35 },
  servicos: [{ id: ID.svc, chave: "canal", name: "Canalização", sku: "canal", unidade: "pt", service_category_id: null, service_subcategory_id: null, linhas: ["wc"],
    medida: "pontos_agua", modo_preco: "tabela", margem: 35, justificacao_preco: null, fases: [1], receita_origem: "catalogo", icone: null, exige_produto_categoria_id: null,
    exige_produto_medida: null, exige_produto_fator: null, exige_produto_arredondar: false, pergunta_manter: null, entulho_modo: null, entulho_m3: null, entulho_kg: null }],
  precosServico: [{ service_id: ID.svc, price: 100, valid_from: "2026-01-15", nota: null, vat_rate: null, created_at: null }],
  usosCons: [{ service_id: ID.svc, product_id: ID.cons, quantity: 1, opcional: false, sort_order: 0 }],
  produtos: [linhaProduto(ID.cons, "Fita de teflon")],
  precosProduto: [{ product_id: ID.cons, price_type: "purchase", price: 2, valid_from: "2026-03-01" }],
});
const montar = () => montarCatalogo(LEVE, catalogo0(), { canal: { n: "Canalização", un: "pt", h: 0, eh: 0, eq: 0, cons: 0, preco: 100, perfil: "", perfilId: "", mo: 0, tot: 0 } as never });
const foto = (M: ReturnType<typeof montar>): FotoCatalogo => fotografar({ C: M.C, K: M.K, svc: M.svc, margens: M.margens });
const doProdutoAusente = (c: { rpc: string; args: Record<string, unknown> }) => Object.values(c.args).includes(ID.ausente);

describe("autosave do Catálogo com a leitura leve (K.produtos parcial)", () => {
  it("o ponto de partida: o Catálogo leve só tem o produto do consumo", () => {
    const M = montar();
    expect(M.K.produtos.map((p) => p.id)).toEqual([ID.cons]);
    expect(diferencasCatalogo(ORG, foto(M), foto(M), { ids: M.ids, produtos: LEVE.produtos })).toEqual([]);
  });
  it("mudar um serviço (preço e margem) não gera chamadas a produtos ausentes, nem apaga nenhum", () => {
    const M = montar(), antes = foto(M), depois = foto(M);
    depois.C.receitas.canal.precoTabela = 120;
    depois.C.receitas.canal.margem = 40;
    const out = diferencasCatalogo(ORG, antes, depois, { ids: M.ids, produtos: LEVE.produtos });
    expect(out.length).toBeGreaterThan(0);
    expect(out.some(doProdutoAusente)).toBe(false);
    expect(out.every((c) => !/apagar|retirar/.test(c.rpc) || !/produto/.test(c.rpc))).toBe(true);
    expect(out.some((c) => c.rpc === "cat_guardar_produto")).toBe(false);
  });
  it("mudar o consumo (quantidade) de um serviço também não toca nos produtos ausentes", () => {
    const M = montar(), antes = foto(M), depois = foto(M);
    depois.C.receitas.canal.cons[0].q = 3;
    const out = diferencasCatalogo(ORG, antes, depois, { ids: M.ids, produtos: LEVE.produtos });
    expect(out.map((c) => c.rpc)).toContain("cat_guardar_servico");
    expect(out.some(doProdutoAusente)).toBe(false);
    expect(out.some((c) => c.rpc === "cat_guardar_produto")).toBe(false);
  });
  it("um produto que só entra no «depois» (sem estar no «antes» nem na base) é gravado como NOVO: por isso o que vem de uma pesquisa se regista também no «antes» e na base", () => {
    const M = montar(), antes = foto(M), depois = foto(M);
    depois.K.produtos.push({ id: ID.ausente, n: "Base de duche", custo: 10, un: "un", marca: "", fornecedor: "", data: "2026-11-17", no: null });
    const novo = diferencasCatalogo(ORG, antes, depois, { ids: M.ids, produtos: LEVE.produtos }).find((c) => c.rpc === "cat_guardar_produto");
    expect(novo?.args.p_id).toBeNull();
  });
  it("registado no «antes» e na base, o produto da pesquisa grava-se como o que é: pelo id, sem duplicado", () => {
    const M = montar(), antes = foto(M), depois = foto(M);
    const lido = { id: ID.ausente, n: "Base de duche", custo: 10, un: "un", marca: "", fornecedor: "", data: "2026-11-17", no: null };
    antes.K.produtos.push(structuredClone(lido));
    depois.K.produtos.push({ ...lido, servico: "canal", fatorServico: 1 });
    const out = diferencasCatalogo(ORG, antes, depois, { ids: M.ids, produtos: [...LEVE.produtos, linhaProduto(ID.ausente, "Base de duche", "produto")] });
    const g = out.filter((c) => c.rpc === "cat_guardar_produto");
    expect(g).toHaveLength(1);
    expect(g[0].args.p_id).toBe(ID.ausente);
    expect(g[0].guarda).toBeUndefined();
  });
});

describe("autosave com a leitura soServicos (sem atributos nem modelos)", () => {
  it("o «antes» e o «depois» vêm da mesma leitura sem atributos nem modelos: nada mudou, nenhuma chamada", async () => {
    const sb = { rpc: async (fn: string) => fn === "cat_ler_catalogo_servicos"
      ? { data: { servicos: [], produtos: [linhaProduto(ID.cons, "Fita de teflon")] }, error: null }
      : { data: null, error: { message: "sem função" } } } as never;
    const { lerCatalogo } = await import("./lerCatalogo");
    const L = await lerCatalogo(sb, ORG, { leve: true, soServicos: true });
    expect(L.atributos).toBeUndefined();
    expect(L.modelos).toBeUndefined();
    const M = montarCatalogo(L, catalogo0(), {});
    const f = () => fotografar({ C: M.C, K: M.K, svc: M.svc, margens: M.margens });
    expect(diferencasCatalogo(ORG, f(), f(), { ids: M.ids, produtos: L.produtos })).toEqual([]);
  });
});
