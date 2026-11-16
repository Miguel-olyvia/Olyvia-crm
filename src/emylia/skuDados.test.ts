// 16/11: as chamadas e os textos da referência (SKU) do Catálogo (skuDados.ts). A base é simulada; confere-se o contrato de 20270118000000.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string) => { data: unknown; error: unknown },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f); }) },
}));

import {
  descreverFaltas, exemploSku, gerarSkuProduto, guardarSigla, guardarSiglaOpcao, guardarSkuConfig, normalizarSigla, preverSku, resolverCategoria, textoSemGerar, validarSigla,
} from "./skuDados";
import type { CategoriaGestao } from "./categoriasMarcasGestao";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33", ID = "c0000000-0000-4000-a000-000000000001";
beforeEach(() => { base.chamadas = []; base.responder = () => ({ data: { ok: true }, error: null }); });
afterEach(() => vi.clearAllMocks());

describe("normalizarSigla e validarSigla", () => {
  it("põe em maiúsculas e corta aos 6 caracteres", () => {
    expect(normalizarSigla("bc")).toBe("BC");
    expect(normalizarSigla("abcdefgh")).toBe("ABCDEF");
    expect(normalizarSigla("")).toBe("");
  });
  it("aceita A-Z e 0-9 de 1 a 6; uma categoria exige pelo menos uma letra", () => {
    expect(validarSigla("BC", true)).toBeNull();
    expect(validarSigla("P1", false)).toBeNull();
    expect(validarSigla("", true)).toMatch(/Escreva a sigla/);
    expect(validarSigla("B C", true)).toMatch(/letras A a Z e algarismos/);
    expect(validarSigla("ÃO", true)).toMatch(/letras A a Z e algarismos/);
    expect(validarSigla("123", true)).toMatch(/pelo menos uma letra/);
    expect(validarSigla("123", false)).toBeNull();
    expect(validarSigla("ABCDEFG", true)).toMatch(/até 6/);
  });
});

describe("as chamadas", () => {
  it("guardarSigla, guardarSiglaOpcao, guardarSkuConfig, gerarSkuProduto e preverSku usam os nomes e argumentos da base", async () => {
    await guardarSigla(ORG, ID, "BC");
    await guardarSiglaOpcao(ORG, ID, "AZ");
    await guardarSkuConfig(ORG, [{ atributo: ID, entra: true }]);
    await gerarSkuProduto(ORG, ID, true);
    await preverSku(ORG, ID, null, [{ atributo: ID, opcao: ID }]);
    expect(base.chamadas).toEqual([
      { f: "cat_guardar_sigla_categoria", a: { p_org: ORG, p_id: ID, p_sigla: "BC" } },
      { f: "cat_guardar_sigla_opcao", a: { p_org: ORG, p_opcao: ID, p_sigla: "AZ" } },
      { f: "cat_guardar_sku_config", a: { p_org: ORG, p_itens: [{ atributo: ID, entra: true }] } },
      { f: "cat_gerar_sku_produto", a: { p_org: ORG, p_produto: ID, p_forcar: true } },
      { f: "cat_prever_sku", a: { p_org: ORG, p_categoria: ID, p_subcategoria: null, p_atributos: [{ atributo: ID, opcao: ID }] } },
    ]);
  });
  it("sigla repetida (CT004) diz «Já existe outra com esta sigla»", async () => {
    base.responder = () => ({ data: null, error: { code: "CT004", message: "Já existe uma categoria com esta sigla.", details: ID } });
    expect(await guardarSigla(ORG, ID, "BC")).toMatchObject({ ok: false, erro: "Já existe outra com esta sigla.", codigo: "CT004" });
    expect(await guardarSiglaOpcao(ORG, ID, "AZ")).toMatchObject({ ok: false, erro: "Já existe outra com esta sigla.", codigo: "CT004" });
  });
  it("função por criar: «Ainda não disponível nesta base»; sem permissão (CT001): a mensagem da base", async () => {
    base.responder = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    expect(await gerarSkuProduto(ORG, ID)).toMatchObject({ ok: false, erro: "Ainda não disponível nesta base" });
    base.responder = () => ({ data: null, error: { code: "CT001", message: "Sem permissão." } });
    expect(await preverSku(ORG, ID, null, [])).toMatchObject({ ok: false, erro: "Sem permissão.", codigo: "CT001" });
  });
  it("lê as respostas de gerar e de prever (campos em falta viram valores seguros)", async () => {
    base.responder = (f) => ({ data: f === "cat_gerar_sku_produto" ? { sku: "BC-TO-0001", gerado: true, faltas: [], motivo: null } : { sku: null, faltas: ["sigla_categoria"] }, error: null });
    expect(await gerarSkuProduto(ORG, ID)).toEqual({ ok: true, v: { sku: "BC-TO-0001", gerado: true, faltas: [], motivo: null } });
    expect(await preverSku(ORG, ID, null, [])).toEqual({ ok: true, v: { sku: null, faltas: ["sigla_categoria"] } });
    base.responder = () => ({ data: { lixo: 1 }, error: null });
    expect(await gerarSkuProduto(ORG, ID)).toEqual({ ok: true, v: { sku: null, gerado: false, faltas: [], motivo: null } });
  });
});

describe("descreverFaltas e textoSemGerar", () => {
  const nomes = { categoria: "Casa de banho", subcategoria: "Torneiras", atributos: { cor: "Cor", medida: "Medida" } };
  it("cada código vira uma frase em português, com os nomes quando se sabem", () => {
    expect(descreverFaltas(["sigla_categoria"], nomes)).toEqual(["Falta a sigla da categoria «Casa de banho»"]);
    expect(descreverFaltas(["sigla_subcategoria"], nomes)).toEqual(["Falta a sigla da subcategoria «Torneiras»"]);
    expect(descreverFaltas(["categoria"])).toEqual(["Falta escolher a categoria"]);
    expect(descreverFaltas(["subcategoria"])).toEqual(["A subcategoria não pertence à categoria escolhida"]);
    expect(descreverFaltas(["sigla:cor", "medida:medida"], nomes)).toEqual(["Falta a sigla da opção escolhida em «Cor»", "Falta a medida de «Medida» completa"]);
    expect(descreverFaltas(["sigla:cor"])).toEqual(["Falta a sigla da opção escolhida em «cor»"]);
    expect(descreverFaltas(["numero"])).toEqual(["Já não há números livres (9999) para esta combinação"]);
    expect(descreverFaltas(["xpto"])).toEqual(["Falta xpto"]);
  });
  it("textoSemGerar explica porque não se gerou", () => {
    expect(textoSemGerar({ sku: null, gerado: false, faltas: ["sigla_categoria"], motivo: "faltas" })).toBe("Falta a sigla da categoria");
    expect(textoSemGerar({ sku: "X", gerado: false, faltas: [], motivo: "sku_manual" })).toBe("a referência atual foi escrita à mão");
    expect(textoSemGerar({ sku: "X", gerado: false, faltas: [], motivo: null })).toBe("não foi possível");
  });
});

describe("exemploSku", () => {
  it("monta o formato pela ordem, só com os que entram; a medida leva o x e um atributo sem opções fica XX", () => {
    const attrs = [
      { tipo: "lista" as const, entra: true, siglas: ["AZ", "VM"] },
      { tipo: "medida" as const, entra: true, siglas: [] },
      { tipo: "lista" as const, entra: false, siglas: ["BR"] },
      { tipo: "lista" as const, entra: true, siglas: [] },
    ];
    expect(exemploSku(attrs)).toBe("BC-TO-0001-AZ-60X30-XX");
    expect(exemploSku([])).toBe("BC-TO-0001");
    expect(exemploSku(attrs, "FER-??-0007")).toBe("FER-??-0007-AZ-60X30-XX");
  });
});

describe("resolverCategoria: nome para ids", () => {
  const sub = (id: string, nome: string, o: { ativo?: boolean; global?: boolean } = {}) => ({ id, nome, ordem: 1, ativo: o.ativo ?? true, global: o.global ?? false, usados: 0, sigla: "X" });
  const cat = (id: string, nome: string, subs: ReturnType<typeof sub>[] = [], o: { ativo?: boolean; global?: boolean } = {}): CategoriaGestao => ({ ...sub(id, nome, o), subcategorias: subs });
  it("acha a categoria e a subcategoria pelo nome, sem acentos nem maiúsculas", () => {
    const L = [cat("c1", "Casa de banho", [sub("s1", "Louças")])];
    expect(resolverCategoria(L, " CASA de banho ", "loucas")).toEqual({ k: "ok", categoria: "c1", subcategoria: "s1" });
    expect(resolverCategoria(L, "Casa de banho", null)).toEqual({ k: "ok", categoria: "c1", subcategoria: null });
  });
  it("não existe (categoria ou subcategoria): nao-existe", () => {
    const L = [cat("c1", "Casa de banho", [sub("s1", "Louças")])];
    expect(resolverCategoria(L, "Outra", null)).toEqual({ k: "nao-existe" });
    expect(resolverCategoria(L, "Casa de banho", "Nova")).toEqual({ k: "nao-existe" });
  });
  it("com o mesmo nome prefere a ativa e da organização (não a global nem a desativada)", () => {
    const L = [cat("g", "Cozinha", [], { global: true }), cat("d", "Cozinha", [], { ativo: false }), cat("o", "Cozinha")];
    expect(resolverCategoria(L, "Cozinha", null)).toEqual({ k: "ok", categoria: "o", subcategoria: null });
    const S = [cat("c", "Cozinha", [sub("sg", "Bancadas", { global: true }), sub("so", "Bancadas")])];
    expect(resolverCategoria(S, "Cozinha", "Bancadas")).toEqual({ k: "ok", categoria: "c", subcategoria: "so" });
  });
  it("se ainda houver mais de um candidato, ambiguo (não adivinha)", () => {
    expect(resolverCategoria([cat("a", "Cozinha"), cat("b", "Cozinha")], "Cozinha", null)).toEqual({ k: "ambiguo" });
    expect(resolverCategoria([cat("a", "Cozinha", [], { global: true }), cat("b", "Cozinha", [], { global: true })], "Cozinha", null)).toEqual({ k: "ambiguo" });
    expect(resolverCategoria([cat("c", "Cozinha", [sub("s1", "Bancadas"), sub("s2", "Bancadas")])], "Cozinha", "Bancadas")).toEqual({ k: "ambiguo" });
  });
  it("só há uma desativada com o nome: usa-se a única que há", () => {
    expect(resolverCategoria([cat("d", "Cozinha", [], { ativo: false })], "Cozinha", null)).toEqual({ k: "ok", categoria: "d", subcategoria: null });
  });
});
