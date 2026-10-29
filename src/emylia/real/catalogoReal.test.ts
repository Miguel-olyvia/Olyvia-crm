// O Catálogo lido da base (montarCatalogo) e o que se grava (diferencasCatalogo, executarCatalogo), com um Catálogo pequeno.
// A prova com o Catálogo inteiro da Mudelar (367 serviços iguais ao cêntimo, e a ida e volta) está em scripts/emylia.
import { describe, expect, it } from "vitest";
import { catalogo0 } from "../v2/catalogoModelo";
import { custoReceita } from "../v2/custosModelo";
import { montarCatalogo, type LinhasCatalogo } from "./catalogoReal";
import { linhasDe } from "./lerCatalogo";
import { diferencasCatalogo, executarCatalogo, fotografar, type Chamada, type FotoCatalogo } from "./gravarCatalogo";

const ORG = "11111111-1111-4111-a111-111111111111";
const ID = { perfil: "22222222-2222-4222-a222-222222222222", equip: "33333333-3333-4333-a333-333333333333", cons: "44444444-4444-4444-a444-444444444444",
  svc: "55555555-5555-4555-a555-555555555555", of: "66666666-6666-4666-a666-666666666666", sub: "77777777-7777-4777-a777-777777777777", prod: "88888888-8888-4888-a888-888888888888" };

function linhas(): LinhasCatalogo {
  return linhasDe({
    parametros: { meses: 14, tsu: 23.75, seguros_ano: 713, horas_ano: 1345, horas_mes: 672, meses_desatualizado: 6, margem_minima: 28, margem_alvo: 35 },
    margemLinha: [{ linha: "coz", margem_minima: 30 }],
    categorias: [{ id: ID.of, name: "Canalização", parent_id: null, sort_order: 0 }, { id: ID.sub, name: "Pontos de água", parent_id: ID.of, sort_order: 0 }],
    perfis: [{ id: ID.perfil, chave: "canalizador", nome: "Canalizador", salario_referencia: 1100, ativo: true }],
    equipamentos: [{ id: ID.equip, nome: "Rebarbadora", compra: 300, vida_anos: 2.5, vida_horas: 1500, residual: 0, manutencao_ano: 30, uso_ano_horas: 600, ativo: true }],
    estrutura: [{ id: "99999999-9999-4999-a999-999999999999", nome: "Renda", categoria: "Renda", mensal: 900, ativo: true, ordem: 0 }],
    servicos: [{ id: ID.svc, chave: "canal", name: "Canalização", sku: "canal", unidade: "pt", service_category_id: ID.of, service_subcategory_id: ID.sub,
      linhas: ["wc"], medida: "pontos_agua", modo_preco: "tabela", margem: 35, justificacao_preco: null, fases: [1, 2], receita_origem: "catalogo", icone: null,
      exige_produto_categoria_id: null, exige_produto_medida: null, exige_produto_fator: null, exige_produto_arredondar: false, pergunta_manter: null,
      entulho_modo: null, entulho_m3: null, entulho_kg: null }],
    precosServico: [{ service_id: ID.svc, price: 100, valid_from: "2026-01-15", nota: "Tabela de 2026", vat_rate: null, created_at: null },
      { service_id: ID.svc, price: 106.05, valid_from: "2026-06-01", nota: "Revisão", vat_rate: null, created_at: null }],
    passos: [{ servico_id: ID.svc, ordem: 1, nome: "Execução", minutos_por_unidade: 120, minutos_fixos: 0, skill_id: ID.perfil, fase: 1 }],
    usosEquip: [{ service_id: ID.svc, equipamento_id: ID.equip, horas: 0.5, ordem: 0 }],
    usosCons: [{ service_id: ID.svc, product_id: ID.cons, quantity: 0.738, opcional: false, sort_order: 0 }],
    produtos: [
      { id: ID.cons, name: "Fita de teflon", sku: "CONS-1", tipo_catalogo: "consumivel", unidade: "un", catalogo_categoria_id: null, servico_id: null, fator_servico: 1,
        entulho_m3: null, entulho_kg: null, short_description: null, marca_livre: null, fornecedor_livre: "Leroy" },
      { id: ID.prod, name: "Torneira", sku: "T-1", tipo_catalogo: "produto", unidade: "un", catalogo_categoria_id: ID.sub, servico_id: ID.svc, fator_servico: 1,
        entulho_m3: null, entulho_kg: null, short_description: null, marca_livre: "Grohe", fornecedor_livre: "Beta" },
    ],
    precosProduto: [{ product_id: ID.cons, price_type: "purchase", price: 0.0135, valid_from: "2026-03-01" }, { product_id: ID.prod, price_type: "purchase", price: 40, valid_from: "2026-03-01" },
      { product_id: ID.prod, price_type: "retail", price: 75, valid_from: "2026-03-01T00:00:01" }],
    fornecedores: [], tecnicos: [],
  });
}
const montar = () => montarCatalogo(linhas(), catalogo0(), { canal: { n: "Canalização", un: "pt", h: 2, eh: 0, eq: 0, cons: 0, preco: 106.05, perfil: "Canalizador", perfilId: "canalizador" } });
const foto = (M: ReturnType<typeof montar>): FotoCatalogo => fotografar({ C: M.C, K: M.K, svc: M.svc, margens: M.margens });

describe("montarCatalogo: as tabelas nos objetos dos ecrãs da Emylia", () => {
  it("o serviço fica pela chave, com a receita, o preço atual e o histórico", () => {
    const M = montar();
    const r = M.C.receitas.canal;
    expect(r.precoTabela).toBe(106.05);
    expect(r.hist.map((h) => h.preco)).toEqual([100, 106.05]);
    expect(r.mo).toEqual([{ id: "p1", n: "Execução", perfil: "canalizador", h: 2 }]);
    expect(r.medida).toBe("pts");
    expect(r.cons[0]).toMatchObject({ id: ID.cons, n: "Fita de teflon", q: 0.738, preco: 0.0135, fornecedor: "Leroy" });
    expect(M.K.classe.canal).toBe(ID.sub);
    expect(M.K.fasesServico?.canal).toEqual([1, 2]);
    expect(M.ids.servico.get("canal")).toBe(ID.svc);
    expect(M.svc.canal.preco).toBe(106.05);
  });
  it("custos: perfil pela chave, equipamento com a vida em horas, margens", () => {
    const M = montar();
    expect(M.C.perfis).toEqual([{ id: "canalizador", n: "Canalizador", salario: 1100 }]);
    expect(M.C.equip[0]).toMatchObject({ id: ID.equip, vida: 1500, usoAno: 600 });
    expect(M.C.minLinha).toEqual({ coz: 30 });
    expect(M.margens).toEqual({ min: 28, alvo: 35 });
    // a mão de obra conta 2 h ao €/h do salário do perfil (sem técnicos)
    const c = custoReceita(M.C.receitas.canal, M.C, false, { tecnicos: [] });
    expect(c.h).toBe(2);
    expect(c.mo).toBeGreaterThan(0);
    expect(c.cons).toBeCloseTo(0.738 * 0.0135, 10);
  });
  it("o produto traz o serviço pela chave, com a marca, o fornecedor, o custo e o PVP", () => {
    const p = montar().K.produtos[0];
    expect(p).toMatchObject({ id: ID.prod, n: "Torneira", servico: "canal", marca: "Grohe", fornecedor: "Beta", custo: 40, pvp: 75, no: ID.sub });
  });
  it("29/10: o PVP mais recente manda; limpo (null) volta a não ter PVP (custo + alvo)", () => {
    const L = linhas();
    L.precosProduto.push({ product_id: ID.prod, price_type: "retail", price: 90, valid_from: "2026-10-29T10:00:00" });
    expect(montarCatalogo(L, catalogo0(), {}).K.produtos[0].pvp).toBe(90);
    L.precosProduto.push({ product_id: ID.prod, price_type: "retail", price: null as unknown as number, valid_from: "2026-10-29T11:00:00" });
    expect(montarCatalogo(L, catalogo0(), {}).K.produtos[0].pvp).toBeUndefined();
  });
  it("uma organização sem Catálogo dá listas vazias e os parâmetros por omissão", () => {
    const M = montarCatalogo(linhasDe(null), catalogo0(), {});
    expect(Object.keys(M.C.receitas)).toHaveLength(0);
    expect(M.K.produtos).toHaveLength(0);
    expect(M.C.par.meses).toBe(14);
  });
});

describe("diferencasCatalogo: o que mudou, em chamadas às funções cat_*", () => {
  it("sem mudanças, nenhuma chamada", () => {
    const M = montar();
    expect(diferencasCatalogo(ORG, foto(M), foto(M), { ids: M.ids, produtos: linhas().produtos })).toEqual([]);
  });
  it("mudar o preço de tabela grava o serviço inteiro e os pormenores, com a chave", () => {
    const M = montar(), antes = foto(M), depois = foto(M);
    depois.C.receitas.canal.precoTabela = 110;
    depois.C.receitas.canal.hist.push({ data: "2026-10-27", preco: 110, nota: "Subida" });
    const ch = diferencasCatalogo(ORG, antes, depois, { ids: M.ids, produtos: linhas().produtos });
    expect(ch.map((c) => c.rpc)).toEqual(["cat_guardar_servico", "cat_guardar_servico_detalhes"]);
    expect(ch[0].args).toMatchObject({ p_id: ID.svc, p_preco_tabela: 110, p_nota_preco: "Subida", p_medida: "pontos_agua", p_categoria_id: ID.of, p_subcategoria_id: ID.sub });
    expect(ch[0].args.p_mo).toEqual([{ nome: "Execução", perfil_id: ID.perfil, minutos_fixos: 0, minutos_por_unidade: 120, fase: 1 }]);
    expect(ch[1].args).toMatchObject({ p_id: ID.svc, p_chave: "canal" });
  });
  it("um consumível escrito à mão cria primeiro o produto e a receita usa o id que a base der", async () => {
    const M = montar(), antes = foto(M), depois = foto(M);
    depois.C.receitas.canal.cons.push({ id: "c9", n: "Abraçadeira", q: 2, un: "un", preco: 0.4, fornecedor: "X", data: "2026-10-27" });
    const ch = diferencasCatalogo(ORG, antes, depois, { ids: M.ids, produtos: linhas().produtos });
    expect(ch[0]).toMatchObject({ rpc: "cat_guardar_produto", guarda: "cons:canal:c9" });
    const feitas: Chamada[] = [];
    const r = await executarCatalogo(ch, async (rpc, args) => { feitas.push({ rpc, args, nota: "" }); return { data: rpc === "cat_guardar_produto" ? "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa" : ID.svc, error: null }; });
    expect(r).toEqual({ feitas: ch.length, erro: null });
    const svc = feitas.find((c) => c.rpc === "cat_guardar_servico")!;
    expect((svc.args.p_cons as { product_id: string }[]).map((c) => c.product_id)).toEqual([ID.cons, "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"]);
  });
  it("parâmetros, um ramo novo e um ramo retirado", () => {
    const M = montar(), antes = foto(M), depois = foto(M);
    depois.C.par.horasMes = 700;
    depois.K.arvore = depois.K.arvore.filter((n) => n.id !== ID.sub).concat({ id: "novo", n: "Esgotos", pai: ID.of });
    const ch = diferencasCatalogo(ORG, antes, depois, { ids: M.ids, produtos: linhas().produtos });
    expect(ch.find((c) => c.rpc === "cat_guardar_parametros")?.args).toMatchObject({ p_horas_mes: 700, p_margem_coz: 30 });
    expect(ch.find((c) => c.rpc === "cat_guardar_categoria")?.args).toMatchObject({ p_id: null, p_nome: "Esgotos", p_pai: ID.of });
    expect(ch.find((c) => c.rpc === "cat_apagar_categoria")?.args).toEqual({ p_org: ORG, p_id: ID.sub });
  });
  it("a gravação pára na primeira chamada que falhar e diz qual", async () => {
    const M = montar(), antes = foto(M), depois = foto(M);
    depois.C.par.horasMes = 700;
    depois.C.receitas.canal.precoTabela = 120;
    const ch = diferencasCatalogo(ORG, antes, depois, { ids: M.ids, produtos: linhas().produtos });
    const r = await executarCatalogo(ch, async () => ({ data: null, error: { message: "Sem permissão (services.manage_prices).", code: "CT001" } }));
    expect(r.feitas).toBe(0);
    expect(r.erro).toBe("Parâmetros de custo: Sem permissão (services.manage_prices).");
  });
});

describe("montarCatalogo: técnicos do RH e o €/h da base (28/10, cargos técnicos)", () => {
  const PERFIL2 = "99999999-0000-4000-8000-000000000002";
  const comRh = (veCusto = true) => {
    const L = linhas();
    L.perfis = [
      { id: ID.perfil, chave: "canalizador", nome: "Canalizador", salario_referencia: 1100, ativo: true,
        custo_hora: 21.5, fonte: "rh", n: 1, nomes: ["Ana Sousa"], cargos: ["Técnico"] },
      { id: PERFIL2, chave: null, nome: "Ladrilhador", salario_referencia: null, ativo: true,
        custo_hora: 19.9, fonte: "cargo", n: 1, nomes: [], cargos: ["Ladrilhador de 1.ª"] },
    ];
    L.tecnicos = [{ id: "pessoa-1", nome: "Ana Sousa", custo_hora: veCusto ? 21.5 : null, perfis: [ID.perfil, PERFIL2] }];
    L.ve_custo_tecnicos = veCusto;
    return L;
  };
  const montarRh = (veCusto = true) => montarCatalogo(comRh(veCusto), catalogo0(), {});

  it("um técnico com vários ofícios conta em todos (perfis), com o primeiro como perfilId", () => {
    const [t] = montarRh().tecnicos;
    expect(t).toMatchObject({ id: "pessoa-1", n: "Ana Sousa", perfilId: "canalizador", perfis: ["canalizador", PERFIL2], custoHora: 21.5 });
    expect(t.semCustoRh).toBeUndefined();
  });
  it("o perfil traz horaBd com o €/h, a fonte e os nomes da base", () => {
    const M = montarRh();
    expect(M.C.perfis[0].horaBd).toEqual({ custoHora: 21.5, fonte: "rh", n: 1, nomes: ["Ana Sousa"], cargos: ["Técnico"] });
    expect(M.C.perfis[1].horaBd).toMatchObject({ custoHora: 19.9, fonte: "cargo", cargos: ["Ladrilhador de 1.ª"] });
  });
  it("sem retribuicao.view o custo do técnico vem escondido (custoOculto), não 'sem custo no RH'", () => {
    const [t] = montarRh(false).tecnicos;
    expect(t.custoOculto).toBe(true);
    expect(t.semCustoRh).toBeUndefined();
  });
  it("as linhas de uma base antiga (sem fonte) não dão horaBd", () => {
    expect(montar().C.perfis[0].horaBd).toBeUndefined();
  });
});
