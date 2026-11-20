// 20/11: o cliente das famílias gravadas na base (familiasDados.ts): o contrato de 20270125100000 com a base simulada.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string) => { data: unknown; error: unknown },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f); }) },
}));

import { apagarFamilia, eixosDaBase, eixosParaGravar, familiasDosProdutos, guardarFamilia, lerFamilia, lerFamilias } from "./familiasDados";
import { A_COR, A_CUBAS, A_MED, DEFS, linha } from "./fixturesFamilias";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33", F1 = "f0000000-0000-4000-a000-000000000001", P1 = "d0000000-0000-4000-a000-000000000001", P2 = "d0000000-0000-4000-a000-000000000002";
const V1 = "2026-11-20T10:00:00.123456+00:00";
beforeEach(() => { base.chamadas = []; base.responder = () => ({ data: { ok: true }, error: null }); });
afterEach(() => vi.clearAllMocks());

describe("as chamadas usam os nomes e os argumentos da base", () => {
  it("ler, ler uma, marcas, guardar (criar e editar) e apagar", async () => {
    base.responder = (f) => ({ data: f === "cat_ler_familias" ? { familias: [] } : f === "cat_familias_dos_produtos" ? { produtos: [] } : f === "cat_guardar_familia" ? { familia: { id: F1, nome: "X", updated_at: V1 } } : { ok: true }, error: null });
    await lerFamilias(ORG);
    await lerFamilia(ORG, F1);
    await familiasDosProdutos(ORG, [P1, P2]);
    await guardarFamilia(ORG, { id: null, nome: "Lava-loiça Velar", eixos: [{ atributoId: A_COR, papel: "cor" }, { atributoId: A_MED, papel: "medida" }], produtos: [P1, P2], versao: null });
    await guardarFamilia(ORG, { id: F1, nome: "Lava-loiça Velar", eixos: [], produtos: [P1], versao: V1 });
    await apagarFamilia(ORG, F1);
    expect(base.chamadas).toEqual([
      { f: "cat_ler_familias", a: { p_org: ORG } },
      { f: "cat_ler_familia", a: { p_org: ORG, p_id: F1 } },
      { f: "cat_familias_dos_produtos", a: { p_org: ORG, p_produtos: [P1, P2] } },
      { f: "cat_guardar_familia", a: { p_org: ORG, p_id: null, p_nome: "Lava-loiça Velar", p_eixos: [{ attribute_id: A_COR, papel: "cor" }, { attribute_id: A_MED, papel: "medida" }], p_produtos: [P1, P2], p_versao: null } },
      { f: "cat_guardar_familia", a: { p_org: ORG, p_id: F1, p_nome: "Lava-loiça Velar", p_eixos: [], p_produtos: [P1], p_versao: V1 } },
      { f: "cat_apagar_familia", a: { p_org: ORG, p_id: F1 } },
    ]);
  });

  it("sem produtos, a marca «noutra família» não vai à base", async () => {
    expect(await familiasDosProdutos(ORG, [])).toEqual({ ok: true, v: new Map() });
    expect(base.chamadas).toHaveLength(0);
  });

  it("a marca «noutra família» nunca pede mais de 60 produtos", async () => {
    base.responder = () => ({ data: { produtos: [] }, error: null });
    await familiasDosProdutos(ORG, Array.from({ length: 70 }, (_, i) => `p${i}`));
    expect((base.chamadas[0].a.p_produtos as string[]).length).toBe(60);
  });
});

describe("as respostas", () => {
  it("lerFamilias traduz a lista e dá valores seguros ao que falta", async () => {
    base.responder = () => ({ data: { familias: [{ id: F1, nome: "Velar", n_produtos: 3, updated_at: V1 }, { id: "f2", nome: "Roca" }] }, error: null });
    expect(await lerFamilias(ORG)).toEqual({ ok: true, v: [{ id: F1, nome: "Velar", nProdutos: 3, versao: V1 }, { id: "f2", nome: "Roca", nProdutos: 0, versao: "" }] });
  });

  it("uma resposta sem a lista é um erro, não uma lista vazia", async () => {
    base.responder = () => ({ data: { lixo: 1 }, error: null });
    expect(await lerFamilias(ORG)).toMatchObject({ ok: false });
  });

  it("lerFamilia traz a versão, os eixos por posição e as linhas dos produtos (no formato da página de produtos)", async () => {
    base.responder = () => ({ data: {
      familia: { id: F1, nome: "Velar", updated_at: V1, eixos: [{ attribute_id: A_MED, papel: "medida", posicao: 2 }, { attribute_id: A_COR, papel: "cor", posicao: 1 }, { attribute_id: "x", papel: "outro", posicao: 3 }] },
      ve_valores: false, produtos: [linha("a", "Velar 50", { custo: null, pvp: null }), { lixo: true }],
    }, error: null });
    const r = await lerFamilia(ORG, F1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.v).toMatchObject({ id: F1, nome: "Velar", versao: V1, veValores: false, eixos: [{ atributoId: A_COR, papel: "cor" }, { atributoId: A_MED, papel: "medida" }] });
    expect(r.v.linhas.map((l) => l.id)).toEqual(["a"]);
    expect(r.v.linhas[0].custo).toBeNull();
  });

  it("familiasDosProdutos dá um mapa produto → família", async () => {
    base.responder = () => ({ data: { produtos: [{ produto_id: P1, familia_id: F1, nome: "Velar" }] }, error: null });
    const r = await familiasDosProdutos(ORG, [P1, P2]);
    expect(r).toEqual({ ok: true, v: new Map([[P1, { familiaId: F1, nome: "Velar" }]]) });
  });

  it("guardarFamilia devolve o id, o nome e a versão nova", async () => {
    base.responder = () => ({ data: { familia: { id: F1, nome: "Velar", updated_at: V1 } }, error: null });
    expect(await guardarFamilia(ORG, { id: null, nome: "Velar", eixos: [], produtos: [P1], versao: null })).toEqual({ ok: true, v: { id: F1, nome: "Velar", versao: V1 } });
  });
});

describe("os erros da base", () => {
  it("função por criar: «Ainda não disponível nesta base»", async () => {
    base.responder = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_ler_familias" } });
    expect(await lerFamilias(ORG)).toMatchObject({ ok: false, erro: "Ainda não disponível nesta base" });
  });
  it("produto já noutra família (CT004): a mensagem da base e o código", async () => {
    base.responder = () => ({ data: null, error: { code: "CT004", message: "O produto «Velar 50» já está na família «Velar»." } });
    expect(await guardarFamilia(ORG, { id: null, nome: "Outra", eixos: [], produtos: [P1], versao: null }))
      .toEqual({ ok: false, erro: "O produto «Velar 50» já está na família «Velar».", codigo: "CT004" });
  });
  it("alterada por outra pessoa (CT004 da concorrência): a mensagem da base", async () => {
    base.responder = () => ({ data: null, error: { code: "CT004", message: "A família foi alterada por outra pessoa: reabra-a." } });
    expect(await guardarFamilia(ORG, { id: F1, nome: "Velar", eixos: [], produtos: [P1], versao: V1 }))
      .toMatchObject({ ok: false, erro: "A família foi alterada por outra pessoa: reabra-a.", codigo: "CT004" });
  });
  it("sem permissão (CT001) ao apagar", async () => {
    base.responder = () => ({ data: null, error: { code: "CT001", message: "Sem permissão (products.edit)." } });
    expect(await apagarFamilia(ORG, F1)).toMatchObject({ ok: false, codigo: "CT001" });
  });
});

describe("os eixos: nome do núcleo ↔ id do atributo", () => {
  it("para gravar: a cor primeiro, depois a medida pela ordem; o atributo de código «medida» chama-se «Medida»", () => {
    expect(eixosParaGravar({ cor: "Cor", medida: ["Medida", "Nº de cubas"] }, DEFS)).toEqual({ ok: true, v: [
      { atributoId: A_COR, papel: "cor" }, { atributoId: A_MED, papel: "medida" }, { atributoId: A_CUBAS, papel: "medida" },
    ] });
    expect(eixosParaGravar({ cor: null, medida: [] }, DEFS)).toEqual({ ok: true, v: [] });
  });
  it("um nome que já não existe nas definições é um erro com o nome", () => {
    expect(eixosParaGravar({ cor: "Acabamento", medida: [] }, DEFS)).toEqual({ ok: false, erro: "Acabamento" });
  });
  it("da base: ids para nomes; ids desconhecidos saem", () => {
    expect(eixosDaBase([{ atributoId: A_COR, papel: "cor" }, { atributoId: A_CUBAS, papel: "medida" }, { atributoId: "x", papel: "medida" }, { atributoId: A_MED, papel: "medida" }], DEFS))
      .toEqual({ cor: "Cor", medida: ["Nº de cubas", "Medida"] });
  });
});
