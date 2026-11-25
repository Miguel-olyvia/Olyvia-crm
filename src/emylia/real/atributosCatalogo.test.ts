// 13/11: os atributos do produto no Catálogo real: a leitura (cat_ler_atributos, tolerante), o que chega a K.atributos e a Produto.attrs,
// e a gravação (cat_guardar_produto_atributos, 4.º RPC só nos produtos novos com atributos).
import { describe, expect, it } from "vitest";
import { catalogo0 } from "../v2/catalogoModelo";
import { juntarAtributos, lerCatalogo, linhasDe } from "./lerCatalogo";
import { montarCatalogo, type LinhasCatalogo } from "./catalogoReal";
import { diferencasCatalogo, executarCatalogo, fotografar, type FotoCatalogo } from "./gravarCatalogo";

const ORG = "11111111-1111-4111-a111-111111111111";
const P1 = "88888888-8888-4888-a888-888888888881", P2 = "88888888-8888-4888-a888-888888888882";
const A_COR = "aaaaaaaa-0000-4000-a000-000000000001", A_MED = "aaaaaaaa-0000-4000-a000-000000000002";
const O_PRETO = "bbbbbbbb-0000-4000-a000-000000000001", O_BRANCO = "bbbbbbbb-0000-4000-a000-000000000002";

const RESPOSTA = {
  atributos: [
    { id: A_COR, codigo: "cor", nome: "Cor", tipo: "lista", tem_hex: true, ordem: 2,
      opcoes: [{ id: O_BRANCO, valor: "BRANCO", nome: "Branco", hex: "#FFFFFF", ordem: 2 }, { id: O_PRETO, valor: "PRETO", nome: "Preto", hex: "#000000", ordem: 1 }] },
    { id: A_MED, codigo: "medida", nome: "Medida", tipo: "medida", tem_hex: false, ordem: 1, opcoes: [] },
  ],
  produtos: [{ id: P1, valores: [
    { atributo: A_COR, opcao: O_PRETO, valor: "Preto", medida: null },
    { atributo: A_MED, opcao: null, valor: "60×60 cm", medida: { tipo: "2D", largura: 60, comprimento: 60, espessura: null, unidade: "cm" } },
  ] }],
};

const prod = (id: string, name: string) => ({ id, name, sku: null, tipo_catalogo: "produto", unidade: "un", catalogo_categoria_id: null, servico_id: null, fator_servico: 1,
  entulho_m3: null, entulho_kg: null, short_description: null, marca_livre: null, fornecedor_livre: null });
const base = (): LinhasCatalogo => linhasDe({ produtos: [prod(P1, "Mosaico"), prod(P2, "Lavatório")] });
const montar = (L: LinhasCatalogo) => montarCatalogo(L, catalogo0(), {});

describe("juntarAtributos", () => {
  it("sem resposta, com erro ou noutro formato (função por criar): as linhas ficam como estão e não há atributos", () => {
    for (const r of [null, undefined, "x", {}, { atributos: "x" }]) {
      const L = juntarAtributos(base(), r);
      expect(L.atributos).toBeUndefined();
      expect(montar(L).K.atributos).toBeUndefined();
      expect(montar(L).K.produtos.every((p) => p.attrs === undefined)).toBe(true);
    }
  });
  it("monta K.atributos (por ordem, com as opções por ordem) e Produto.attrs só nos produtos com valores", () => {
    const K = montar(juntarAtributos(base(), RESPOSTA)).K;
    expect(K.atributos?.map((a) => a.codigo)).toEqual(["medida", "cor"]);
    expect(K.atributos?.[1]).toMatchObject({ id: A_COR, nome: "Cor", tipo: "lista", temHex: true });
    expect(K.atributos?.[1].opcoes.map((o) => o.nome)).toEqual(["Preto", "Branco"]);
    expect(K.atributos?.[1].opcoes.map((o) => o.valor)).toEqual(["PRETO", "BRANCO"]);
    const p1 = K.produtos.find((p) => p.id === P1)!, p2 = K.produtos.find((p) => p.id === P2)!;
    expect(p1.attrs).toEqual([
      { atributoId: A_COR, opcaoId: O_PRETO, valor: "Preto" },
      { atributoId: A_MED, valor: "60×60 cm", medida: { tipo: "2D", largura: 60, comprimento: 60, espessura: null, unidade: "cm" } },
    ]);
    expect(p2.attrs).toBeUndefined();
  });
  it("um valor de produto com a opção desativada (ativa: false) fica marcado como inativa e mantém o id", () => {
    const R = { ...RESPOSTA, produtos: [{ id: P1, valores: [{ atributo: A_COR, opcao: "bbbbbbbb-0000-4000-a000-0000000000aa", valor: "PIZARRA", medida: null, ativa: false }] }] };
    expect(montar(juntarAtributos(base(), R)).K.produtos.find((p) => p.id === P1)!.attrs)
      .toEqual([{ atributoId: A_COR, opcaoId: "bbbbbbbb-0000-4000-a000-0000000000aa", valor: "PIZARRA", inativa: true }]);
  });
  it("resposta válida sem atributos definidos: K.atributos vazio", () => {
    expect(montar(juntarAtributos(base(), { atributos: [], produtos: [] })).K.atributos).toEqual([]);
  });
});

describe("lerCatalogo: a 3.ª chamada é tolerante", () => {
  const catalogo = { data: { produtos: [prod(P1, "Mosaico")] }, error: null };
  const sb = (atributos: () => unknown) => ({
    rpc: async (fn: string) => (fn === "cat_ler_atributos_definicoes" || fn === "cat_ler_atributos" ? atributos() : fn === "cat_ler_catalogo" ? catalogo : { data: null, error: { message: "sem função" } }),
  }) as never;
  it("lê os atributos pela função antiga quando a nova (definições) ainda não existe na base", async () => {
    const chamadas: string[] = [];
    const antigo = { rpc: async (fn: string) => { chamadas.push(fn); return fn === "cat_ler_atributos" ? { data: RESPOSTA, error: null } : fn === "cat_ler_catalogo" ? catalogo : { data: null, error: { code: "PGRST202", message: "Could not find the function public." + fn } }; } } as never;
    const L = await lerCatalogo(antigo, ORG);
    expect(chamadas).toContain("cat_ler_atributos_definicoes");
    expect(L.atributos?.defs).toHaveLength(2);
    expect(montar(L).K.produtos[0].attrs).toHaveLength(2);
  });
  it("função que não existe (PGRST202), erro qualquer, exceção ou resposta vazia: o Catálogo lê-se na mesma, sem atributos", async () => {
    const falhas = [
      () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_ler_atributos" } }),
      () => ({ data: null, error: { code: "CT001", message: "Sem permissão" } }),
      () => { throw new Error("rede"); },
      () => Promise.reject(new Error("rede")),
      () => undefined,
    ];
    for (const f of falhas) {
      const L = await lerCatalogo(sb(f), ORG);
      expect(L.produtos).toHaveLength(1);
      expect(L.atributos).toBeUndefined();
    }
  });
});

describe("gravar um produto novo com atributos", () => {
  const foto = (L: LinhasCatalogo): FotoCatalogo => { const M = montar(L); return fotografar({ C: M.C, K: M.K, svc: M.svc, margens: M.margens }); };
  const M0 = montar(juntarAtributos(base(), RESPOSTA));
  const ids = M0.ids, produtos = base().produtos;
  const novo = (attrs?: unknown) => ({ id: "novo", n: "Base de duche", custo: 100, un: "un", marca: "", fornecedor: "", data: "2026-11-13", no: null, ...(attrs ? { attrs } : {}) });
  const ATTRS = [{ atributoId: A_COR, opcaoId: O_PRETO, valor: "Preto" }, { atributoId: A_MED, medida: { tipo: "2D", largura: 60, comprimento: 60, espessura: null, unidade: "cm" } }];
  const dif = (p: unknown) => {
    const antes = foto(juntarAtributos(base(), RESPOSTA)), depois = foto(juntarAtributos(base(), RESPOSTA));
    depois.K.produtos.push(p as never);
    return diferencasCatalogo(ORG, antes, depois, { ids, produtos });
  };
  it("sem atributos a lista de chamadas é a de sempre (sem cat_guardar_produto_atributos); só se acrescenta gerar a referência (16/11)", () => {
    expect(dif(novo()).map((c) => c.rpc)).toEqual(["cat_guardar_produto", "cat_guardar_produto_texto", "cat_gerar_sku_produto"]);
    expect(dif(novo([])).map((c) => c.rpc)).toEqual(["cat_guardar_produto", "cat_guardar_produto_texto", "cat_gerar_sku_produto"]);
  });
  it("com atributos acrescenta o cat_guardar_produto_atributos, no fim, com o produto por resolver e os valores no formato da base", () => {
    const ch = dif(novo(ATTRS));
    expect(ch.map((c) => c.rpc)).toEqual(["cat_guardar_produto", "cat_guardar_produto_texto", "cat_guardar_produto_atributos", "cat_gerar_sku_produto"]);
    expect(ch[2].args).toEqual({ p_org: ORG, p_produto: { tmp: "prod:novo" }, p_valores: [
      { atributo: A_COR, opcao: O_PRETO }, { atributo: A_MED, medida: { tipo: "2D", largura: 60, comprimento: 60, espessura: null, unidade: "cm" } },
    ] });
  });
  it("executarCatalogo troca o tmp pelo id que a base deu ao produto", async () => {
    const ch = dif(novo(ATTRS)), feitas: { rpc: string; args: Record<string, unknown> }[] = [];
    const r = await executarCatalogo(ch, async (rpc, args) => { feitas.push({ rpc, args }); return { data: rpc === "cat_guardar_produto" ? "cccccccc-cccc-4ccc-accc-cccccccccccc" : { ok: true }, error: null }; });
    expect(r).toEqual({ feitas: 4, erro: null, avisos: [] });
    expect(feitas[2].args.p_produto).toBe("cccccccc-cccc-4ccc-accc-cccccccccccc");
  });
  it("um produto que já existe não regrava atributos quando só muda a marca", () => {
    const antes = foto(juntarAtributos(base(), RESPOSTA)), depois = foto(juntarAtributos(base(), RESPOSTA));
    depois.K.produtos.find((p) => p.id === P1)!.marca = "Roca";
    const ch = diferencasCatalogo(ORG, antes, depois, { ids, produtos });
    expect(ch.map((c) => c.rpc)).toEqual(["cat_guardar_produto", "cat_guardar_produto_texto"]);
  });
});

describe("foto na opção (migration por aplicar: a leitura é tolerante)", () => {
  const CAMINHO = `${ORG}/33333333-3333-4333-a333-333333333333.webp`;
  const COM_FOTO = {
    atributos: [
      { id: A_COR, codigo: "cor", nome: "Cor", tipo: "lista", tem_hex: true, tem_foto: true, ordem: 2,
        opcoes: [{ id: O_BRANCO, valor: "BRANCO", nome: "Branco", hex: null, foto: CAMINHO, ordem: 2 }, { id: O_PRETO, valor: "PRETO", nome: "Preto", hex: "#000000", foto: null, ordem: 1 }] },
    ],
    produtos: [],
  };
  it("sem as chaves novas (a base ainda não as devolve): foto null em cada opção e temFoto false, sem rebentar", () => {
    const cor = montar(juntarAtributos(base(), RESPOSTA)).K.atributos?.find((a) => a.id === A_COR);
    expect(cor?.temFoto).toBe(false);
    expect(cor?.opcoes.map((o) => o.foto)).toEqual([null, null]);
  });
  it("com as chaves: temFoto e o caminho da foto de cada opção chegam a K.atributos", () => {
    const cor = montar(juntarAtributos(base(), COM_FOTO)).K.atributos?.[0];
    expect(cor?.temFoto).toBe(true);
    expect(cor?.opcoes.map((o) => [o.nome, o.foto])).toEqual([["Preto", null], ["Branco", CAMINHO]]);
    expect(cor?.opcoes.find((o) => o.nome === "Branco")?.hex).toBeNull();
  });
  it("valores esquisitos (foto vazia, número, tem_foto como texto) contam como sem foto", () => {
    const R = { atributos: [{ ...COM_FOTO.atributos[0], tem_foto: "sim", opcoes: [{ id: O_BRANCO, valor: "B", hex: null, foto: "", ordem: 1 }, { id: O_PRETO, valor: "P", hex: null, foto: 7, ordem: 2 }] }], produtos: [] };
    const cor = montar(juntarAtributos(base(), R)).K.atributos?.[0];
    expect(cor?.temFoto).toBe(false);
    expect(cor?.opcoes.map((o) => o.foto)).toEqual([null, null]);
  });
});

describe("«Tem aspeto» no atributo (migration por aplicar: a leitura é tolerante)", () => {
  const COM_ASPETO = {
    atributos: [
      { id: A_COR, codigo: "cor", nome: "Cor", tipo: "lista", tem_hex: true, tem_aspeto: true, ordem: 2,
        opcoes: [{ id: O_BRANCO, valor: "BRANCO", nome: "Branco", hex: "#FFFFFF", metal: false, superficie: null, ordem: 2 }, { id: O_PRETO, valor: "PRETO", nome: "Preto", hex: "#000000", metal: true, superficie: "acetinada", ordem: 1 }] },
    ],
    produtos: [],
  };
  it("sem as chaves novas: nada de temAspeto, metal nem superficie nas definições (as opções ficam exactamente como hoje)", () => {
    const cor = montar(juntarAtributos(base(), RESPOSTA)).K.atributos?.find((a) => a.id === A_COR);
    expect(cor).not.toHaveProperty("temAspeto");
    for (const o of cor?.opcoes ?? []) { expect(o).not.toHaveProperty("metal"); expect(o).not.toHaveProperty("superficie"); }
  });
  it("com as chaves: temAspeto, e o metal e a superfície de cada opção chegam a K.atributos", () => {
    const cor = montar(juntarAtributos(base(), COM_ASPETO)).K.atributos?.[0];
    expect(cor?.temAspeto).toBe(true);
    expect(cor?.opcoes.map((o) => [o.nome, o.metal, o.superficie])).toEqual([["Preto", true, "acetinada"], ["Branco", false, null]]);
  });
  it("valores esquisitos: uma superfície que não é uma das três conta como nenhuma, e metal que não é booleano como false", () => {
    const R = { atributos: [{ ...COM_ASPETO.atributos[0], opcoes: [{ id: O_BRANCO, valor: "B", hex: null, metal: "sim", superficie: "brilhante", ordem: 1 }] }], produtos: [] };
    expect(montar(juntarAtributos(base(), R)).K.atributos?.[0].opcoes.map((o) => [o.metal, o.superficie])).toEqual([[false, null]]);
  });
  it("tem_aspeto como texto conta como desligado: nada chega", () => {
    const R = { atributos: [{ ...COM_ASPETO.atributos[0], tem_aspeto: "sim" }], produtos: [] };
    expect(montar(juntarAtributos(base(), R)).K.atributos?.[0]).not.toHaveProperty("temAspeto");
  });
});
