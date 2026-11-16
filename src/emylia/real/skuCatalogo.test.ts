// 16/11: criar um produto gera a referência (SKU) no fim da gravação: cat_gerar_sku_produto é o ÚLTIMO passo, só se o utilizador deixou a referência
// vazia, e tolerante a falha (o produto fica criado; o aviso diz porque a referência ficou por gerar).
import { describe, expect, it, vi } from "vitest";
import { catalogo0 } from "../v2/catalogoModelo";
import { juntarAtributos, linhasDe } from "./lerCatalogo";
import { montarCatalogo, type LinhasCatalogo } from "./catalogoReal";
import { diferencasCatalogo, executarCatalogo, fotografar, type Chamada, type FotoCatalogo } from "./gravarCatalogo";

const ORG = "11111111-1111-4111-a111-111111111111";
const P1 = "88888888-8888-4888-a888-888888888881";
const A_COR = "aaaaaaaa-0000-4000-a000-000000000001", O_PRETO = "bbbbbbbb-0000-4000-a000-000000000001";
const RESPOSTA = {
  atributos: [{ id: A_COR, codigo: "cor", nome: "Cor", tipo: "lista", tem_hex: true, ordem: 1, opcoes: [{ id: O_PRETO, valor: "PRETO", nome: "Preto", hex: "#000000", ordem: 1 }] }],
  produtos: [],
};
const prod = (id: string, name: string) => ({ id, name, sku: null, tipo_catalogo: "produto", unidade: "un", catalogo_categoria_id: null, servico_id: null, fator_servico: 1,
  entulho_m3: null, entulho_kg: null, short_description: null, marca_livre: null, fornecedor_livre: null });
const base = (): LinhasCatalogo => linhasDe({ produtos: [prod(P1, "Mosaico")] });
const montar = (L: LinhasCatalogo) => montarCatalogo(L, catalogo0(), {});
const foto = (L: LinhasCatalogo): FotoCatalogo => { const M = montar(L); return fotografar({ C: M.C, K: M.K, svc: M.svc, margens: M.margens }); };
const M0 = montar(juntarAtributos(base(), RESPOSTA));
const ids = M0.ids, produtos = base().produtos;
const novo = (extra: Record<string, unknown> = {}) => ({ id: "novo", n: "Base de duche", custo: 100, un: "un", marca: "", fornecedor: "", data: "2026-11-16", no: null, ...extra });
const dif = (p: unknown) => {
  const antes = foto(juntarAtributos(base(), RESPOSTA)), depois = foto(juntarAtributos(base(), RESPOSTA));
  depois.K.produtos.push(p as never);
  return diferencasCatalogo(ORG, antes, depois, { ids, produtos });
};

describe("o plano de gravação de um produto novo", () => {
  it("referência vazia: cat_gerar_sku_produto é o último passo, depois de atributos, com o produto por resolver, tolerante", () => {
    const ch = dif(novo({ attrs: [{ atributoId: A_COR, opcaoId: O_PRETO, valor: "Preto" }] }));
    expect(ch.map((c) => c.rpc)).toEqual(["cat_guardar_produto", "cat_guardar_produto_texto", "cat_guardar_produto_atributos", "cat_gerar_sku_produto"]);
    expect(ch.at(-1)).toMatchObject({ rpc: "cat_gerar_sku_produto", tolerante: true, produto: "Base de duche", args: { p_org: ORG, p_produto: { tmp: "prod:novo" }, p_forcar: false } });
  });
  it("sem atributos também gera (a referência vem da categoria e da subcategoria)", () => {
    expect(dif(novo()).map((c) => c.rpc).at(-1)).toBe("cat_gerar_sku_produto");
  });
  it("com tabelas (20270117100000) vem depois de cat_guardar_produto_tabelas", () => {
    const antes = foto(juntarAtributos(base(), RESPOSTA)), depois = foto(juntarAtributos(base(), RESPOSTA));
    depois.K.produtos.push(novo({ attrs: [{ atributoId: A_COR, opcaoId: O_PRETO, valor: "Preto" }] }) as never);
    const r = diferencasCatalogo(ORG, antes, depois, { ids: { ...ids, tabelas: true }, produtos }).map((c) => c.rpc);
    expect(r.at(-1)).toBe("cat_gerar_sku_produto");
    expect(r.indexOf("cat_guardar_produto_tabelas")).toBeLessThan(r.indexOf("cat_gerar_sku_produto"));
    expect(r.indexOf("cat_guardar_produto_atributos")).toBeLessThan(r.indexOf("cat_gerar_sku_produto"));
  });
  it("com a referência escrita pelo utilizador não se gera: fica essa", () => {
    expect(dif(novo({ sku: "GR-77" })).map((c) => c.rpc)).not.toContain("cat_gerar_sku_produto");
    expect(dif(novo({ sku: "   " })).map((c) => c.rpc)).toContain("cat_gerar_sku_produto");
  });
  it("um produto que já existe, ou um consumível novo, não gera referência", () => {
    const antes = foto(juntarAtributos(base(), RESPOSTA)), depois = foto(juntarAtributos(base(), RESPOSTA));
    depois.K.produtos.find((p) => p.id === P1)!.marca = "Roca";
    expect(diferencasCatalogo(ORG, antes, depois, { ids, produtos }).map((c) => c.rpc)).not.toContain("cat_gerar_sku_produto");
    const d2 = foto(juntarAtributos(base(), RESPOSTA));
    (d2.K.consumiveisCriados ??= []).push({ id: "k-cola", n: "Cola", un: "un", preco: 5, fornecedor: "X", data: "2026-11-16" });
    expect(diferencasCatalogo(ORG, antes, d2, { ids, produtos }).map((c) => c.rpc)).not.toContain("cat_gerar_sku_produto");
  });
});

describe("executarCatalogo com o passo tolerante", () => {
  const plano: Chamada[] = [
    { rpc: "cat_guardar_produto", nota: "Produto: X", guarda: "prod:novo", args: { p_org: ORG } },
    { rpc: "cat_gerar_sku_produto", nota: "Produto: X (referência)", tolerante: true, produto: "Base de duche", args: { p_org: ORG, p_produto: { tmp: "prod:novo" }, p_forcar: false } },
  ];
  const ID = "99999999-9999-4999-a999-999999999999";
  const rpcCom = (resp: unknown) => vi.fn(async (fn: string) => (fn === "cat_guardar_produto" ? { data: ID, error: null } : resp as never));
  it("gerou: sem avisos, e o produto novo vai pelo id que a base deu", async () => {
    const rpc = rpcCom({ data: { sku: "BC-TO-0001", gerado: true, faltas: [], motivo: null }, error: null });
    expect(await executarCatalogo(plano, rpc)).toEqual({ feitas: 2, erro: null, avisos: [] });
    expect(rpc).toHaveBeenLastCalledWith("cat_gerar_sku_produto", { p_org: ORG, p_produto: ID, p_forcar: false });
  });
  it("a base respondeu que faltam siglas: o produto fica criado e o aviso diz o que falta", async () => {
    const rpc = rpcCom({ data: { sku: null, gerado: false, faltas: ["sigla_categoria"], motivo: "faltas" }, error: null });
    const r = await executarCatalogo(plano, rpc);
    expect(r.erro).toBeNull();
    expect(r.avisos).toEqual(["Produto «Base de duche» criado; referência por gerar: Falta a sigla da categoria"]);
  });
  it("a chamada falhou (erro da base ou função por aplicar): sem anular a criação, o aviso traz o motivo", async () => {
    let r = await executarCatalogo(plano, rpcCom({ data: null, error: { code: "CT002", message: "Já não há números livres (9999) para o SKU BC-TO." } }));
    expect(r.erro).toBeNull();
    expect(r.avisos).toEqual(["Produto «Base de duche» criado; referência por gerar: Já não há números livres (9999) para o SKU BC-TO."]);
    r = await executarCatalogo(plano, rpcCom({ data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_gerar_sku_produto" } }));
    expect(r.avisos).toEqual(["Produto «Base de duche» criado; referência por gerar: Ainda não disponível nesta base"]);
  });
  it("uma chamada NÃO tolerante que falha continua a parar tudo", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "rebentou" } }));
    expect(await executarCatalogo(plano, rpc)).toEqual({ feitas: 0, erro: "Produto: X: rebentou", avisos: [] });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("uma exceção de rede no passo tolerante também vira aviso", async () => {
    const rpc = vi.fn(async (fn: string) => { if (fn === "cat_guardar_produto") return { data: ID, error: null }; throw new Error("rede em baixo"); });
    const r = await executarCatalogo(plano, rpc as never);
    expect(r.erro).toBeNull();
    expect(r.avisos).toEqual(["Produto «Base de duche» criado; referência por gerar: rede em baixo"]);
  });
});
