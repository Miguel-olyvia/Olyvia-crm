// 23/11 (testarh, Mudelar): «Criar o produto» na página leve de Produtos dava «Não gravou: Serviço: Demolição e entulho: duplicate key value violates unique
// constraint services_organization_id_sku_key», com o produto já criado. A página comparava o Catálogo leve com o do formulário usando os custos da store
// (lerCustos), que podiam trazer as receitas de outra página, e sem os ids dos serviços: cada receita parecia um serviço NOVO (cat_guardar_servico sem id).
// diferencasProdutoNovo só grava o produto e o que lhe diz respeito.
import { describe, expect, it } from "vitest";
import { catalogo0, type Catalogo } from "../v2/catalogoModelo";
import { custos0, type Custos, type ReceitaV2 } from "../v2/custosModelo";
import { criarProdutoCompleto } from "../criarCatalogo";
import { diferencasCatalogo, diferencasProdutoNovo } from "./gravarCatalogo";

const ORG = "3242e925-da26-459a-8258-be04d904e355";
const SERVICO = "55555555-5555-4555-a555-555555555555";
const MARGENS = { min: 28, alvo: 35 };
const receita = (sid: string): ReceitaV2 => ({ sid, origem: "editada", mo: [{ id: "p1", n: "Execução", perfil: "servente", h: 1 }], equip: [], cons: [], modo: "margem", precoTabela: 0, margem: 35, medida: null, hist: [] });
/** Os custos da store como a página de Serviços os deixa: com a receita da «Demolição e entulho» (chave demol). */
const custosComReceitas = (): Custos => { const C = custos0(); return { ...C, receitas: { ...C.receitas, demol: receita("demol") } }; };
const leve = (): Catalogo => ({ ...catalogo0(), produtos: [] });
const comProduto = (K: Catalogo, o: Partial<Parameters<typeof criarProdutoCompleto>[1]> = {}) => {
  const r = criarProdutoCompleto(K, { n: "Móvel AXIS Suspenso c/lavatório 60x50x36 - 2 Gav c/ Fundo Reduzido", custo: 120, un: "un", ...o });
  if (!r.ok) throw new Error(r.erro);
  return r.K;
};

describe("criar um produto na página leve de Produtos (diferencasProdutoNovo)", () => {
  it("a causa: com os custos da store partilhados e sem os ids dos serviços, a comparação de sempre regravava a receita como serviço NOVO", () => {
    const C = custosComReceitas(), K = leve(), foto = (k: Catalogo) => ({ C, K: k, svc: {}, margens: MARGENS });
    const out = diferencasCatalogo(ORG, foto(K), foto(comProduto(K)), { ids: { servico: new Map(), perfil: new Map(), tabelas: true }, produtos: [] });
    const svc = out.find((c) => c.rpc === "cat_guardar_servico");
    expect(svc?.args.p_id).toBeNull();
  });
  it("só grava o produto novo e o que lhe diz respeito: nenhum serviço, perfil, parâmetro ou ramo", () => {
    const K = leve();
    const out = diferencasProdutoNovo(ORG, K, comProduto(K), custosComReceitas(), MARGENS);
    const rpcs = out.map((c) => c.rpc);
    expect(rpcs[0]).toBe("cat_guardar_produto");
    expect(rpcs.every((r) => r.startsWith("cat_guardar_produto") || r === "cat_gerar_sku_produto" || r === "cat_ligar_fornecedor_produto")).toBe(true);
    expect(out[0].args).toMatchObject({ p_id: null, p_tipo: "produto", p_nome: "Móvel AXIS Suspenso c/lavatório 60x50x36 - 2 Gav c/ Fundo Reduzido", p_servico_id: null, p_fator_servico: 1 });
  });
  it("o serviço escolhido da lista da organização (id da base) grava-se em products.servico_id pela mesma cat_guardar_produto", () => {
    const K = leve();
    const out = diferencasProdutoNovo(ORG, K, comProduto(K, { servico: SERVICO }), custosComReceitas(), MARGENS);
    expect(out[0]).toMatchObject({ rpc: "cat_guardar_produto", args: { p_servico_id: SERVICO, p_fator_servico: 1 } });
  });
  it("sem nada mudado, nada a gravar (mesmo com receitas na store)", () => {
    const K = leve();
    expect(diferencasProdutoNovo(ORG, K, K, custosComReceitas(), MARGENS)).toEqual([]);
  });
});
