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
    rpc: async (fn: string) => (fn === "cat_ler_atributos" ? atributos() : fn === "cat_ler_catalogo" ? catalogo : { data: null, error: { message: "sem função" } }),
  }) as never;
  it("lê os atributos quando a função responde", async () => {
    const L = await lerCatalogo(sb(() => ({ data: RESPOSTA, error: null })), ORG);
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
  it("sem atributos a lista de chamadas é a de sempre (sem o 4.º RPC)", () => {
    expect(dif(novo()).map((c) => c.rpc)).toEqual(["cat_guardar_produto", "cat_guardar_produto_texto"]);
    expect(dif(novo([])).map((c) => c.rpc)).toEqual(["cat_guardar_produto", "cat_guardar_produto_texto"]);
  });
  it("com atributos acrescenta o cat_guardar_produto_atributos, no fim, com o produto por resolver e os valores no formato da base", () => {
    const ch = dif(novo(ATTRS));
    expect(ch.map((c) => c.rpc)).toEqual(["cat_guardar_produto", "cat_guardar_produto_texto", "cat_guardar_produto_atributos"]);
    expect(ch[2].args).toEqual({ p_org: ORG, p_produto: { tmp: "prod:novo" }, p_valores: [
      { atributo: A_COR, opcao: O_PRETO }, { atributo: A_MED, medida: { tipo: "2D", largura: 60, comprimento: 60, espessura: null, unidade: "cm" } },
    ] });
  });
  it("executarCatalogo troca o tmp pelo id que a base deu ao produto", async () => {
    const ch = dif(novo(ATTRS)), feitas: { rpc: string; args: Record<string, unknown> }[] = [];
    const r = await executarCatalogo(ch, async (rpc, args) => { feitas.push({ rpc, args }); return { data: rpc === "cat_guardar_produto" ? "cccccccc-cccc-4ccc-accc-cccccccccccc" : { ok: true }, error: null }; });
    expect(r).toEqual({ feitas: 3, erro: null });
    expect(feitas[2].args.p_produto).toBe("cccccccc-cccc-4ccc-accc-cccccccccccc");
  });
  it("um produto que já existe não regrava atributos quando só muda a marca", () => {
    const antes = foto(juntarAtributos(base(), RESPOSTA)), depois = foto(juntarAtributos(base(), RESPOSTA));
    depois.K.produtos.find((p) => p.id === P1)!.marca = "Roca";
    const ch = diferencasCatalogo(ORG, antes, depois, { ids, produtos });
    expect(ch.map((c) => c.rpc)).toEqual(["cat_guardar_produto", "cat_guardar_produto_texto"]);
  });
});
