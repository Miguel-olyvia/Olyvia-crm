// 16/11 (20270118300000): os modelos no Catálogo real: a leitura (cat_ler_modelos_gestao + products.model_id, tolerante), o que chega a K.modelos e a
// Produto.modeloId/modelo, e a gravação de um produto novo com modelo (cat_guardar_produto_modelo antes de gerar a referência).
import { describe, expect, it } from "vitest";
import { catalogo0 } from "../v2/catalogoModelo";
import { juntarModelos, lerCatalogo, linhasDe } from "./lerCatalogo";
import { montarCatalogo, type LinhasCatalogo } from "./catalogoReal";
import { diferencasCatalogo, executarCatalogo, fotografar, type FotoCatalogo } from "./gravarCatalogo";

const ORG = "11111111-1111-4111-a111-111111111111";
const P1 = "88888888-8888-4888-a888-888888888881", P2 = "88888888-8888-4888-a888-888888888882";
const C1 = "c0000000-0000-4000-a000-000000000001", S1 = "50000000-0000-4000-a000-000000000001";
const M1 = "e0000000-0000-4000-a000-000000000001", M2 = "e0000000-0000-4000-a000-000000000002";
const NOVO_ID = "cccccccc-cccc-4ccc-accc-cccccccccccc";

const prod = (id: string, name: string) => ({ id, name, sku: null, tipo_catalogo: "produto", unidade: "un", catalogo_categoria_id: null, servico_id: null, fator_servico: 1,
  entulho_m3: null, entulho_kg: null, short_description: null, marca_livre: null, fornecedor_livre: null });
const MODELOS = { modelos: [
  { id: M1, nome: "SORTY", numero: 1, ativo: true, usados: 1, subcategoria: { id: S1, nome: "Bases de Duche", sigla: "BD", ativo: true }, categoria: { id: C1, nome: "Casa de banho", sigla: "CB" } },
  { id: M2, nome: "ZEUS", numero: 7, ativo: false, usados: 0, subcategoria: { id: S1, nome: "Bases de Duche", sigla: "BD", ativo: true }, categoria: { id: C1, nome: "Casa de banho", sigla: "CB" } },
] };
const LIGACOES = [{ id: P1, model_id: M1 }, { id: P2, model_id: "e0000000-0000-4000-a000-0000000000ff" }];
const base = (): LinhasCatalogo => linhasDe({ produtos: [prod(P1, "Base"), prod(P2, "Outra")] });
const montar = (L: LinhasCatalogo) => montarCatalogo(L, catalogo0(), {});

describe("juntarModelos e montarCatalogo", () => {
  it("K.modelos traz os modelos (número, subcategoria, estado) e cada produto o seu modelo", () => {
    const K = montar(juntarModelos(base(), MODELOS, LIGACOES)).K;
    expect(K.modelos).toEqual([
      { id: M1, n: "SORTY", numero: 1, sub: S1, ativo: true },
      { id: M2, n: "ZEUS", numero: 7, sub: S1, ativo: false },
    ]);
    const p1 = K.produtos.find((p) => p.id === P1)!;
    expect(p1).toMatchObject({ modeloId: M1, modelo: "SORTY", modeloNumero: 1 });
    // a ligação a um modelo que a lista não traz (apagado) não inventa um modelo
    const p2 = K.produtos.find((p) => p.id === P2)!;
    expect(p2.modeloId).toBeUndefined();
    expect(p2.modelo).toBeUndefined();
  });
  it("sem resposta (função por criar) fica tudo como estava: sem K.modelos e sem modelo nos produtos", () => {
    for (const r of [null, undefined, {}, { modelos: "x" }]) {
      const L = juntarModelos(base(), r, null);
      expect(L.modelos).toBeUndefined();
      const K = montar(L).K;
      expect(K.modelos).toBeUndefined();
      expect(K.produtos[0].modeloId).toBeUndefined();
    }
  });
  it("com os modelos mas sem as ligações (a leitura dos produtos falhou), os modelos lêem-se e os produtos ficam sem modelo", () => {
    const K = montar(juntarModelos(base(), MODELOS, null)).K;
    expect(K.modelos).toHaveLength(2);
    expect(K.produtos.every((p) => p.modeloId === undefined)).toBe(true);
  });
});

describe("lerCatalogo: os modelos são tolerantes", () => {
  const catalogo = { data: { produtos: [prod(P1, "Base")] }, error: null };
  /** `ligacoes`: o que a leitura da tabela products devolve (por páginas de 1000). */
  const sb = (modelos: () => unknown, ligacoes: (de: number) => unknown) => ({
    rpc: async (fn: string) => (fn === "cat_ler_modelos_gestao" ? modelos() : fn === "cat_ler_catalogo" ? catalogo : { data: null, error: { message: "sem função" } }),
    from: (tabela: string) => {
      const c: Record<string, unknown> = {};
      let de = 0;
      for (const k of ["select", "eq", "not"]) c[k] = () => c;
      c.range = async (a: number) => { de = a; return tabela === "products" ? ligacoes(de) : { data: [], error: null }; };
      return c;
    },
  }) as never;

  it("lê os modelos mas já não lê products.model_id: o modelo de cada produto vem da lista e da ficha (16/11)", async () => {
    let leuTabela = false;
    const L = await lerCatalogo(sb(() => ({ data: MODELOS, error: null }), () => { leuTabela = true; return { data: [{ id: P1, model_id: M1 }], error: null }; }), ORG);
    expect(leuTabela).toBe(false);
    expect(L.modelos?.lista).toHaveLength(2);
    expect(L.modelos?.produtos).toBeNull();
    expect(montar(L).K.produtos[0].modeloId).toBeUndefined();
  });
  it("função por criar, erro, exceção ou sem modelos: o Catálogo lê-se na mesma, sem modelos", async () => {
    const falhas = [
      () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_ler_modelos_gestao" } }),
      () => ({ data: null, error: { code: "CT001", message: "Sem permissão" } }),
      () => { throw new Error("rede"); },
      () => Promise.reject(new Error("rede")),
      () => undefined,
    ];
    for (const f of falhas) {
      const L = await lerCatalogo(sb(f, () => ({ data: [], error: null })), ORG);
      expect(L.produtos).toHaveLength(1);
      expect(L.modelos).toBeUndefined();
    }
  });
});

describe("gravar um produto novo com modelo", () => {
  const foto = (L: LinhasCatalogo): FotoCatalogo => { const M = montar(L); return fotografar({ C: M.C, K: M.K, svc: M.svc, margens: M.margens }); };
  const M0 = montar(base());
  const ids = M0.ids, produtos = base().produtos;
  const novo = (extra: Record<string, unknown> = {}) => ({ id: "novo", n: "Base de duche", custo: 100, un: "un", marca: "", fornecedor: "", data: "2026-11-16", no: null, ...extra });
  const dif = (p: unknown) => {
    const antes = foto(base()), depois = foto(base());
    depois.K.produtos.push(p as never);
    return diferencasCatalogo(ORG, antes, depois, { ids, produtos });
  };
  type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

  it("sem modelo a lista de chamadas é a de sempre", () => {
    expect(dif(novo()).map((c) => c.rpc)).toEqual(["cat_guardar_produto", "cat_guardar_produto_texto", "cat_gerar_sku_produto"]);
  });
  it("com um modelo que já existe: cat_guardar_produto_modelo depois do produto e ANTES de gerar a referência", () => {
    const ch = dif(novo({ modeloId: M1 }));
    expect(ch.map((c) => c.rpc)).toEqual(["cat_guardar_produto", "cat_guardar_produto_texto", "cat_guardar_produto_modelo", "cat_gerar_sku_produto"]);
    expect(ch[2].args).toEqual({ p_org: ORG, p_produto: { tmp: "prod:novo" }, p_modelo: M1 });
  });
  it("com a classificação por tabelas, o modelo vem depois de cat_guardar_produto_tabelas (o modelo tem de ser da subcategoria já gravada)", () => {
    const M = montar({ ...base(), tabelas: { categoriasProduto: [], marcas: [], unidades: [], exige: [] } });
    const antes = foto({ ...base(), tabelas: { categoriasProduto: [], marcas: [], unidades: [], exige: [] } }), depois = foto({ ...base(), tabelas: { categoriasProduto: [], marcas: [], unidades: [], exige: [] } });
    depois.K.produtos.push(novo({ modeloId: M1 }) as never);
    const ch = diferencasCatalogo(ORG, antes, depois, { ids: M.ids, produtos });
    const r = ch.map((c) => c.rpc);
    expect(r.indexOf("cat_guardar_produto_modelo")).toBeGreaterThan(r.indexOf("cat_guardar_produto_tabelas"));
    expect(r.indexOf("cat_guardar_produto_modelo")).toBeLessThan(r.indexOf("cat_gerar_sku_produto"));
  });
  it("com um modelo novo: resolve a subcategoria, cria o modelo (número automático), liga-o ao produto e só depois gera a referência", () => {
    const ch = dif(novo({ modeloNovo: "  SORTY  " }));
    expect(ch.map((c) => c.rpc)).toEqual(["cat_guardar_produto", "cat_guardar_produto_texto", "cat_ler_categorias_gestao", "cat_guardar_modelo", "cat_guardar_produto_modelo", "cat_gerar_sku_produto"]);
    expect(ch[3].args).toEqual({ p_org: ORG, p_id: null, p_subcategoria: { tmp: "sub:prod:novo" }, p_nome: "SORTY", p_numero: null });
    expect(ch[4].args).toEqual({ p_org: ORG, p_produto: { tmp: "prod:novo" }, p_modelo: { tmp: "modelo:prod:novo" } });
    expect(ch.slice(2, 5).every((c) => c.tolerante)).toBe(true);
  });
  it("um produto que já existe não regrava o modelo (grava-se na ficha)", () => {
    const antes = foto(juntarModelos(base(), MODELOS, LIGACOES)), depois = foto(juntarModelos(base(), MODELOS, LIGACOES));
    depois.K.produtos.find((p) => p.id === P1)!.marca = "Roca";
    expect(diferencasCatalogo(ORG, antes, depois, { ids, produtos }).map((c) => c.rpc)).toEqual(["cat_guardar_produto", "cat_guardar_produto_texto"]);
  });

  /** Uma base simulada: dá o id ao produto, devolve as categorias e o modelo criado. */
  const baseSimulada = (feitas: { rpc: string; args: Record<string, unknown> }[], sobre: Record<string, unknown> = {}): Rpc => async (rpc, args) => {
    feitas.push({ rpc, args });
    if (rpc in sobre) return sobre[rpc] as never;
    if (rpc === "cat_guardar_produto") return { data: NOVO_ID, error: null };
    if (rpc === "cat_ler_categorias_gestao") return { data: { categorias: [
      { id: C1, nome: "Casa de banho", subcategorias: [{ id: S1, nome: "Bases de Duche" }] }, { id: "c2", nome: "Cozinha", subcategorias: [{ id: "s9", nome: "Bases de Duche" }] },
    ] }, error: null };
    if (rpc === "cat_guardar_modelo") return { data: { modelo: { id: M1, numero: 1 } }, error: null };
    if (rpc === "cat_gerar_sku_produto") return { data: { sku: "CB-BD-0001", gerado: true, faltas: [], motivo: null }, error: null };
    return { data: { ok: true }, error: null };
  };
  // ramos só de produto (soProduto): não se gravam na árvore dos serviços, vão pelo nome com o produto
  const arvore = [{ id: "n1", n: "Casa de banho", pai: null, soProduto: true }, { id: "n2", n: "Bases de Duche", pai: "n1", soProduto: true }];
  // com as tabelas de referência (o caso real): a categoria e a subcategoria gravam-se pelo nome, sem ramos por criar nos serviços
  const comTabelas = (): LinhasCatalogo => ({ ...base(), tabelas: { categoriasProduto: [], marcas: [], unidades: [], exige: [] } });
  const difComRamo = (extra: Record<string, unknown>) => {
    const antes = foto(comTabelas()), depois = foto(comTabelas());
    depois.K.arvore = arvore as never;
    depois.K.produtos.push(novo({ no: "n2", ...extra }) as never);
    return diferencasCatalogo(ORG, antes, depois, { ids: montar(comTabelas()).ids, produtos });
  };

  it("executar: o modelo novo é criado na subcategoria certa (pelos nomes da categoria e da subcategoria do produto) e ligado ao produto", async () => {
    const ch = difComRamo({ modeloNovo: "SORTY" });
    const feitas: { rpc: string; args: Record<string, unknown> }[] = [];
    const r = await executarCatalogo(ch, baseSimulada(feitas));
    expect(r.erro).toBeNull();
    expect(r.avisos).toEqual([]);
    const criar = feitas.find((f) => f.rpc === "cat_guardar_modelo")!;
    expect(criar.args).toMatchObject({ p_subcategoria: S1, p_nome: "SORTY" });
    expect(feitas.find((f) => f.rpc === "cat_guardar_produto_modelo")!.args).toEqual({ p_org: ORG, p_produto: NOVO_ID, p_modelo: M1 });
    expect(feitas.map((f) => f.rpc).at(-1)).toBe("cat_gerar_sku_produto");
  });
  it("executar: se não se acha a subcategoria, o produto fica criado, diz-se que o modelo ficou por ligar e a gravação continua", async () => {
    const ch = difComRamo({ modeloNovo: "SORTY" });
    const feitas: { rpc: string; args: Record<string, unknown> }[] = [];
    const r = await executarCatalogo(ch, baseSimulada(feitas, { cat_ler_categorias_gestao: { data: { categorias: [] }, error: null } }));
    expect(r.erro).toBeNull();
    expect(r.avisos.join(" ")).toMatch(/modelo por ligar/);
    expect(feitas.some((f) => f.rpc === "cat_guardar_modelo")).toBe(false);
  });
  it("executar: um erro da base ao criar o modelo (nome repetido) é aviso, não pára a gravação", async () => {
    const ch = difComRamo({ modeloNovo: "SORTY" });
    const feitas: { rpc: string; args: Record<string, unknown> }[] = [];
    const r = await executarCatalogo(ch, baseSimulada(feitas, { cat_guardar_modelo: { data: null, error: { code: "CT004", message: "Já existe um modelo com este nome nesta subcategoria." } } }));
    expect(r.erro).toBeNull();
    expect(r.avisos.join(" ")).toMatch(/modelo por ligar: Já existe um modelo com este nome/);
    expect(feitas.map((f) => f.rpc)).toContain("cat_gerar_sku_produto");
  });
  it("executar: a referência duplicada (mesmo modelo e atributos) avisa e não pára", async () => {
    const ch = difComRamo({ modeloId: M1 });
    const r = await executarCatalogo(ch, baseSimulada([], { cat_gerar_sku_produto: { data: { sku: null, gerado: false, faltas: ["duplicado"], motivo: "duplicado", outro_produto: P1 }, error: null } }));
    expect(r.erro).toBeNull();
    expect(r.avisos).toEqual(["Produto «Base de duche» criado; referência por gerar: Já existe um produto com este modelo e estes atributos"]);
  });
});
