// 16/11: o fornecedor de um produto ou consumível NOVO liga-se pelo fornecedor real (cat_ligar_fornecedor_produto), tolerante a falha;
// o texto continua a gravar-se por cat_guardar_produto_texto (compatibilidade: se a ligação falhar, o nome do fornecedor fica escrito).
import { describe, expect, it, vi } from "vitest";
import { catalogo0 } from "../v2/catalogoModelo";
import { juntarAtributos, linhasDe } from "./lerCatalogo";
import { montarCatalogo, type LinhasCatalogo } from "./catalogoReal";
import { diferencasCatalogo, executarCatalogo, fotografar, type FotoCatalogo } from "./gravarCatalogo";

const ORG = "11111111-1111-4111-a111-111111111111";
const P1 = "88888888-8888-4888-a888-888888888881";
const F1 = "77777777-7777-4777-a777-777777777771";
const ID = "99999999-9999-4999-a999-999999999999";
const prod = (id: string, name: string) => ({ id, name, sku: null, tipo_catalogo: "produto", unidade: "un", catalogo_categoria_id: null, servico_id: null, fator_servico: 1,
  entulho_m3: null, entulho_kg: null, short_description: null, marca_livre: null, fornecedor_livre: null });
const base = (): LinhasCatalogo => juntarAtributos(linhasDe({ produtos: [prod(P1, "Mosaico")] }), { atributos: [], produtos: [] });
const foto = (L: LinhasCatalogo): FotoCatalogo => { const M = montarCatalogo(L, catalogo0(), {}); return fotografar({ C: M.C, K: M.K, svc: M.svc, margens: M.margens }); };
const M0 = montarCatalogo(base(), catalogo0(), {});
const ids = M0.ids, produtos = base().produtos;
const novo = (extra: Record<string, unknown> = {}) => ({ id: "novo", n: "Base de duche", custo: 100, un: "un", marca: "Roca", fornecedor: "", data: "2026-11-16", no: null, sku: "GR-1", ...extra });
const novoCons = (extra: Record<string, unknown> = {}) => ({ id: "k-cola", n: "Cola", un: "un", preco: 5, fornecedor: "", data: "2026-11-16", ...extra });
const difProd = (p: unknown) => {
  const antes = foto(base()), depois = foto(base());
  depois.K.produtos.push(p as never);
  return diferencasCatalogo(ORG, antes, depois, { ids, produtos });
};
const difCons = (c: unknown) => {
  const antes = foto(base()), depois = foto(base());
  (depois.K.consumiveisCriados ??= []).push(c as never);
  return diferencasCatalogo(ORG, antes, depois, { ids, produtos });
};

describe("plano: fornecedor real de um produto novo", () => {
  it("fornecedor existente: liga pelo id, com o produto por resolver, tolerante e com o aviso do produto", () => {
    const ch = difProd(novo({ fornecedor: "Sanitop", fornecedorId: F1 }));
    const lig = ch.find((c) => c.rpc === "cat_ligar_fornecedor_produto");
    expect(lig).toMatchObject({ tolerante: true, aviso: "Produto «Base de duche» criado; fornecedor por ligar",
      args: { p_org: ORG, p_produto: { tmp: "prod:novo" }, p_fornecedor: F1, p_novo_nome: null, p_nif: null, p_email: null } });
    expect(ch.findIndex((c) => c.rpc === "cat_guardar_produto")).toBeLessThan(ch.findIndex((c) => c.rpc === "cat_ligar_fornecedor_produto"));
  });
  it("fornecedor pendente: manda nome, NIF e email, e nunca o id", () => {
    const ch = difProd(novo({ fornecedor: "Sanitop Lda", fornecedorNovo: { nome: "Sanitop Lda", nif: "500100200", email: "geral@sanitop.pt" } }));
    expect(ch.find((c) => c.rpc === "cat_ligar_fornecedor_produto")?.args)
      .toEqual({ p_org: ORG, p_produto: { tmp: "prod:novo" }, p_fornecedor: null, p_novo_nome: "Sanitop Lda", p_nif: "500100200", p_email: "geral@sanitop.pt" });
  });
  it("pendente sem NIF nem email: manda null (não texto vazio)", () => {
    const a = difProd(novo({ fornecedor: "X", fornecedorNovo: { nome: "X", nif: "  ", email: "" } })).find((c) => c.rpc === "cat_ligar_fornecedor_produto")!.args;
    expect(a).toMatchObject({ p_novo_nome: "X", p_nif: null, p_email: null });
  });
  it("mantém o texto do fornecedor por cat_guardar_produto_texto (compatibilidade, e a marca)", () => {
    const t = difProd(novo({ fornecedor: "Sanitop", fornecedorId: F1 })).find((c) => c.rpc === "cat_guardar_produto_texto")!;
    expect(t.args).toMatchObject({ p_marca: "Roca", p_fornecedor: "Sanitop" });
  });
  it("sem fornecedor real (texto livre do protótipo ou vazio): não liga", () => {
    expect(difProd(novo({ fornecedor: "Sanitop" })).map((c) => c.rpc)).not.toContain("cat_ligar_fornecedor_produto");
    expect(difProd(novo()).map((c) => c.rpc)).not.toContain("cat_ligar_fornecedor_produto");
  });
  it("um produto que já existe e muda de marca não liga fornecedor", () => {
    const antes = foto(base()), depois = foto(base());
    depois.K.produtos.find((p) => p.id === P1)!.marca = "Roca";
    expect(diferencasCatalogo(ORG, antes, depois, { ids, produtos }).map((c) => c.rpc)).not.toContain("cat_ligar_fornecedor_produto");
  });
  it("a referência gerada continua a ser o último passo", () => {
    const ch = difProd(novo({ sku: "", fornecedor: "S", fornecedorId: F1 }));
    expect(ch.at(-1)?.rpc).toBe("cat_gerar_sku_produto");
  });
});

describe("plano: fornecedor real de um consumível novo", () => {
  it("liga pelo id, com aviso de consumível", () => {
    const ch = difCons(novoCons({ fornecedor: "Sanitop", fornecedorId: F1 }));
    expect(ch.find((c) => c.rpc === "cat_ligar_fornecedor_produto")).toMatchObject({ tolerante: true, aviso: "Consumível «Cola» criado; fornecedor por ligar",
      args: { p_org: ORG, p_produto: { tmp: "prod:k-cola" }, p_fornecedor: F1, p_novo_nome: null } });
  });
  it("pendente: cria ao guardar", () => {
    const ch = difCons(novoCons({ fornecedor: "Novo", fornecedorNovo: { nome: "Novo", email: "a@b.pt" } }));
    expect(ch.find((c) => c.rpc === "cat_ligar_fornecedor_produto")?.args).toMatchObject({ p_fornecedor: null, p_novo_nome: "Novo", p_nif: null, p_email: "a@b.pt" });
  });
  it("sem fornecedor real não liga", () => {
    expect(difCons(novoCons({ fornecedor: "Por escolher" })).map((c) => c.rpc)).not.toContain("cat_ligar_fornecedor_produto");
  });
});

describe("executarCatalogo com a ligação do fornecedor", () => {
  const plano = () => difProd(novo({ fornecedor: "Sanitop", fornecedorId: F1 }));
  const rpcCom = (lig: unknown) => vi.fn(async (fn: string) => (fn === "cat_ligar_fornecedor_produto" ? lig as never : { data: ID, error: null }));
  it("liga com o id que a base deu ao produto", async () => {
    const rpc = rpcCom({ data: { fornecedor: { id: F1, nome: "Sanitop", criado: false, reutilizado: false }, ligacao: { id: "l", preferido: true } }, error: null });
    const r = await executarCatalogo(plano(), rpc);
    expect(r).toMatchObject({ erro: null, avisos: [] });
    expect(rpc).toHaveBeenCalledWith("cat_ligar_fornecedor_produto", expect.objectContaining({ p_produto: ID, p_fornecedor: F1 }));
  });
  it("falha da ligação: o produto fica criado, a gravação continua e o aviso diz porquê", async () => {
    const rpc = rpcCom({ data: null, error: { message: "CT001: sem permissão para criar fornecedores", code: "CT001" } });
    const r = await executarCatalogo(plano(), rpc);
    expect(r.erro).toBeNull();
    expect(r.avisos).toEqual(["Produto «Base de duche» criado; fornecedor por ligar: CT001: sem permissão para criar fornecedores"]);
    expect(rpc.mock.calls.map((c) => c[0])).toContain("cat_guardar_produto_texto");
  });
  it("função ainda sem existir na base: aviso em português, sem partir a gravação", async () => {
    const rpc = rpcCom({ data: null, error: { message: "Could not find the function", code: "PGRST202" } });
    const r = await executarCatalogo(plano(), rpc);
    expect(r.erro).toBeNull();
    expect(r.avisos[0]).toMatch(/^Produto «Base de duche» criado; fornecedor por ligar: Ainda não disponível/);
  });
  it("erro de rede lançado: também só avisa", async () => {
    const rpc = vi.fn(async (fn: string) => { if (fn === "cat_ligar_fornecedor_produto") throw new Error("offline"); return { data: ID, error: null } as never; });
    const r = await executarCatalogo(plano(), rpc);
    expect(r.erro).toBeNull();
    expect(r.avisos[0]).toContain("fornecedor por ligar: offline");
  });
});
