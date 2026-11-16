// 16/11: os dados dos MODELOS do Catálogo (modelosDados.ts): o contrato de 20270118300000 com a base simulada.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string) => { data: unknown; error: unknown },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f); }) },
}));

import { estadoModelo, guardarModelo, guardarProdutoModelo, lerModelosGestao, ligarModeloAoProduto, numeroSku, rotuloModelo } from "./modelosDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33", SUB = "50000000-0000-4000-a000-000000000001", M1 = "e0000000-0000-4000-a000-000000000001", P1 = "d0000000-0000-4000-a000-000000000001";
beforeEach(() => { base.chamadas = []; base.responder = () => ({ data: { ok: true }, error: null }); });
afterEach(() => vi.clearAllMocks());

describe("numeroSku e rotuloModelo", () => {
  it("o número tem sempre 4 dígitos e o rótulo junta-o ao nome", () => {
    expect(numeroSku(1)).toBe("0001");
    expect(numeroSku(9999)).toBe("9999");
    expect(rotuloModelo({ numero: 2, nome: "STONE PLUS" })).toBe("0002 · STONE PLUS");
  });
});

describe("as chamadas", () => {
  it("usam os nomes e os argumentos da base", async () => {
    await lerModelosGestao(ORG);
    await guardarModelo(ORG, { id: null, subcategoria: SUB, nome: "SORTY", numero: null });
    await guardarModelo(ORG, { id: M1, subcategoria: null, nome: "SORTY 2", numero: null });
    await estadoModelo(ORG, M1, false);
    await guardarProdutoModelo(ORG, P1, M1);
    await guardarProdutoModelo(ORG, P1, null);
    expect(base.chamadas).toEqual([
      { f: "cat_ler_modelos_gestao", a: { p_org: ORG } },
      { f: "cat_guardar_modelo", a: { p_org: ORG, p_id: null, p_subcategoria: SUB, p_nome: "SORTY", p_numero: null } },
      { f: "cat_guardar_modelo", a: { p_org: ORG, p_id: M1, p_subcategoria: null, p_nome: "SORTY 2", p_numero: null } },
      { f: "cat_estado_modelo", a: { p_org: ORG, p_id: M1, p_ativo: false } },
      { f: "cat_guardar_produto_modelo", a: { p_org: ORG, p_produto: P1, p_modelo: M1 } },
      { f: "cat_guardar_produto_modelo", a: { p_org: ORG, p_produto: P1, p_modelo: null } },
    ]);
  });
  it("lerModelosGestao traduz a resposta e dá valores seguros ao que falta", async () => {
    base.responder = () => ({ data: { modelos: [
      { id: M1, nome: "SORTY", numero: 1, ativo: true, usados: 3, subcategoria: { id: SUB, nome: "Bases de Duche", sigla: "BD", ativo: true }, categoria: { id: "c1", nome: "Casa de banho", sigla: "DB" } },
      { id: "m2", nome: "ZEUS", numero: 7, ativo: false, subcategoria: { id: SUB, nome: "Bases de Duche" } },
    ] }, error: null });
    const r = await lerModelosGestao(ORG);
    expect(r).toEqual({ ok: true, v: [
      { id: M1, nome: "SORTY", numero: 1, ativo: true, usados: 3, subcategoria: { id: SUB, nome: "Bases de Duche", sigla: "BD", ativo: true }, categoria: { id: "c1", nome: "Casa de banho", sigla: "DB" } },
      { id: "m2", nome: "ZEUS", numero: 7, ativo: false, usados: 0, subcategoria: { id: SUB, nome: "Bases de Duche", sigla: null, ativo: true }, categoria: null },
    ] });
  });
  it("uma resposta sem a lista é um erro, não uma lista vazia", async () => {
    base.responder = () => ({ data: { lixo: 1 }, error: null });
    expect(await lerModelosGestao(ORG)).toMatchObject({ ok: false });
  });
  it("função por criar: «Ainda não disponível nesta base»; sem permissão (CT001) e nome repetido (CT004): a mensagem da base", async () => {
    base.responder = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    expect(await lerModelosGestao(ORG)).toMatchObject({ ok: false, erro: "Ainda não disponível nesta base" });
    base.responder = () => ({ data: null, error: { code: "CT001", message: "Sem permissão." } });
    expect(await estadoModelo(ORG, M1, true)).toMatchObject({ ok: false, erro: "Sem permissão.", codigo: "CT001" });
    base.responder = () => ({ data: null, error: { code: "CT004", message: "Já existe um modelo com este nome nesta subcategoria." } });
    expect(await guardarModelo(ORG, { id: null, subcategoria: SUB, nome: "SORTY", numero: null })).toMatchObject({ ok: false, erro: "Já existe um modelo com este nome nesta subcategoria.", codigo: "CT004" });
  });
});

describe("ligarModeloAoProduto (a ficha: um modelo que existe, nenhum, ou um novo na subcategoria do produto)", () => {
  const CATS = { categorias: [{ id: "c1", nome: "Casa de banho", ordem: 1, ativo: true, global: false, usados: 0, subcategorias: [{ id: SUB, nome: "Bases de Duche", ordem: 1, ativo: true, global: false, usados: 0 }] }] };
  const ramo = { categoria: "Casa de banho", subcategoria: "Bases de Duche" };
  beforeEach(() => {
    base.responder = (f) => ({ data: f === "cat_ler_categorias_gestao" ? CATS : f === "cat_guardar_modelo" ? { modelo: { id: M1, numero: 3 } } : { ok: true }, error: null });
  });
  it("um modelo que já existe liga-se direto, sem ler nem criar nada", async () => {
    expect(await ligarModeloAoProduto(ORG, P1, { id: M1, novo: null }, ramo)).toEqual({ ok: true, v: M1 });
    expect(base.chamadas.map((c) => c.f)).toEqual(["cat_guardar_produto_modelo"]);
    expect(base.chamadas[0].a).toEqual({ p_org: ORG, p_produto: P1, p_modelo: M1 });
  });
  it("sem modelo desliga (p_modelo null)", async () => {
    expect(await ligarModeloAoProduto(ORG, P1, { id: "", novo: null }, ramo)).toEqual({ ok: true, v: null });
    expect(base.chamadas[0].a).toEqual({ p_org: ORG, p_produto: P1, p_modelo: null });
  });
  it("um modelo novo cria-se na subcategoria achada pelos nomes (número automático) e liga-se ao produto, por esta ordem", async () => {
    expect(await ligarModeloAoProduto(ORG, P1, { id: "", novo: "SORTY" }, ramo)).toEqual({ ok: true, v: M1 });
    expect(base.chamadas.map((c) => c.f)).toEqual(["cat_ler_categorias_gestao", "cat_guardar_modelo", "cat_guardar_produto_modelo"]);
    expect(base.chamadas[1].a).toEqual({ p_org: ORG, p_id: null, p_subcategoria: SUB, p_nome: "SORTY", p_numero: null });
    expect(base.chamadas[2].a).toEqual({ p_org: ORG, p_produto: P1, p_modelo: M1 });
  });
  it("sem subcategoria, com a subcategoria por existir ou com nomes repetidos: diz porquê e não cria nada", async () => {
    expect(await ligarModeloAoProduto(ORG, P1, { id: "", novo: "SORTY" }, { categoria: "Casa de banho", subcategoria: null })).toMatchObject({ ok: false, erro: "Escolha a subcategoria antes de criar o modelo." });
    expect(await ligarModeloAoProduto(ORG, P1, { id: "", novo: "SORTY" }, { categoria: "Casa de banho", subcategoria: "Outra" })).toMatchObject({ ok: false, erro: "A subcategoria ainda não existe na base: guarde primeiro a classificação." });
    base.responder = () => ({ data: { categorias: [CATS.categorias[0], { ...CATS.categorias[0], id: "c2" }] }, error: null });
    expect(await ligarModeloAoProduto(ORG, P1, { id: "", novo: "SORTY" }, ramo)).toMatchObject({ ok: false, erro: "Há categorias com o mesmo nome: não se sabe onde criar o modelo." });
    expect(base.chamadas.some((c) => c.f === "cat_guardar_modelo" || c.f === "cat_guardar_produto_modelo")).toBe(false);
  });
  it("o erro da base ao criar (nome repetido) ou ao ligar volta tal e qual, e o que vem a seguir não corre", async () => {
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: CATS, error: null } : { data: null, error: { code: "CT004", message: "Já existe um modelo com este nome nesta subcategoria." } });
    expect(await ligarModeloAoProduto(ORG, P1, { id: "", novo: "SORTY" }, ramo)).toMatchObject({ ok: false, erro: "Já existe um modelo com este nome nesta subcategoria.", codigo: "CT004" });
    expect(base.chamadas.some((c) => c.f === "cat_guardar_produto_modelo")).toBe(false);
    base.chamadas = [];
    base.responder = () => ({ data: null, error: { code: "CT002", message: "O modelo «SORTY» não é da subcategoria deste produto." } });
    expect(await ligarModeloAoProduto(ORG, P1, { id: M1, novo: null }, ramo)).toMatchObject({ ok: false, erro: "O modelo «SORTY» não é da subcategoria deste produto." });
  });
});
