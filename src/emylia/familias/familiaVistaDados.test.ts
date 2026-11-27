// A leitura da vista da família (lerFamiliaVista, em familiasDados.ts): chama cat_ler_familia_vista (20270129300000) e traduz a resposta; a função ainda por
// aplicar na base dá um erro claro («Ainda não disponível nesta base») e não parte nada. Com a base simulada.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string) => { data: unknown; error: unknown },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f); }) },
}));

import { lerFamiliaVista } from "./familiasDados";

const ORG = "3242e925-da26-459a-8258-be04d904e355", FAM = "5c013d98-0000-4000-a000-000000000001";
const COR = "a0000000-0000-4000-a000-0000000000c1", TON = "a0000000-0000-4000-a000-0000000000c2", MED = "a0000000-0000-4000-a000-0000000000c3";

const resposta = () => ({
  familia: { id: FAM, nome: "Base de Duche CACH 70 × 100 cm" }, ve_valores: true, ve_stock: false,
  eixos: [
    { attribute_id: TON, code: "textura", rotulo: "Textura", papel: "medida", posicao: 2, is_measurement: false },
    { attribute_id: COR, code: "cor", rotulo: "Cor", papel: "cor", posicao: 0, is_measurement: false },
    { attribute_id: MED, code: "medida", rotulo: "Medida", papel: "medida", posicao: 1, is_measurement: true },
  ],
  produtos: [{
    id: "p1", nome: "Base de Duche CACH Antracita 70X100 LISO", sku: "DB-BD-0003-AN-LS-70X100", estado: "draft", pvp: 205, stock: null,
    modelo_id: "m1", modelo: "CACH", subcategoria_id: "s1", subcategoria: "Bases Duche", categoria_id: "c1", categoria: "Bases e Resguardos",
    medida: { attribute_id: MED, valor: { tipo: "2D", largura: 70, comprimento: 100, unidade: "cm" }, unidade: "cm", texto: "70×100 cm" },
    aplicacao: null,
    valores: {
      [COR]: { valor: "ANTRACITA", nome: "ANTRACITA", hex: "#645E5E", foto: null, sigla: "AN", ordem: 7, is_metal: false },
      [TON]: { valor: "Liso", nome: "Liso", hex: null, foto: null, sigla: "LS", ordem: 1, is_metal: false },
      [MED]: { valor: "70×100 cm", nome: "70×100 cm", hex: null, foto: null, sigla: null, ordem: null, is_metal: null },
    },
  }],
  modelos: ["m1"],
  outras_medidas: [{ id: FAM, nome: "Base de Duche CACH 70 × 100 cm", atual: true, medida: "70×100 cm", medida_valor: { tipo: "2D" }, unidade: "cm" }],
});

beforeEach(() => { base.chamadas = []; base.responder = () => ({ data: resposta(), error: null }); });
afterEach(() => vi.clearAllMocks());

describe("lerFamiliaVista", () => {
  it("chama cat_ler_familia_vista com a organização e a família", async () => {
    await lerFamiliaVista(ORG, FAM);
    expect(base.chamadas).toEqual([{ f: "cat_ler_familia_vista", a: { p_org: ORG, p_id: FAM } }]);
  });

  it("traduz a família, os eixos (pela posição), os produtos e as outras medidas", async () => {
    const r = await lerFamiliaVista(ORG, FAM);
    if ("erro" in r) throw new Error(r.erro);
    expect(r.v).toMatchObject({ id: FAM, nome: "Base de Duche CACH 70 × 100 cm", veValores: true, veStock: false });
    expect(r.v.eixos.map((e) => [e.code, e.posicao, e.isMeasurement])).toEqual([["cor", 0, false], ["medida", 1, true], ["textura", 2, false]]);
    const p = r.v.produtos[0]!;
    expect(p).toMatchObject({ id: "p1", sku: "DB-BD-0003-AN-LS-70X100", estado: "draft", pvp: 205, stock: null, modeloId: "m1", subcategoriaId: "s1", categoria: "Bases e Resguardos", aplicacao: null });
    expect(p.medida).toEqual({ atributoId: MED, valor: { tipo: "2D", largura: 70, comprimento: 100, unidade: "cm" }, unidade: "cm", texto: "70×100 cm" });
    expect(p.valores[COR]).toEqual({ valor: "ANTRACITA", nome: "ANTRACITA", hex: "#645E5E", foto: null, sigla: "AN", ordem: 7, isMetal: false });
    expect(r.v.outrasMedidas).toEqual([{ id: FAM, nome: "Base de Duche CACH 70 × 100 cm", atual: true, medida: "70×100 cm", medidaValor: { tipo: "2D" }, unidade: "cm" }]);
  });

  it("sem as permissões a base devolve pvp e stock null e o ecrã fica sem esses números (nunca 0)", async () => {
    base.responder = () => ({ data: { ...resposta(), ve_valores: false, produtos: [{ ...resposta().produtos[0], pvp: null, stock: null }] }, error: null });
    const r = await lerFamiliaVista(ORG, FAM);
    if ("erro" in r) throw new Error(r.erro);
    expect(r.v.veValores).toBe(false);
    expect(r.v.produtos[0]).toMatchObject({ pvp: null, stock: null });
  });

  it("o stock de zero unidades é um número (0), diferente de sem acesso (null)", async () => {
    base.responder = () => ({ data: { ...resposta(), ve_stock: true, produtos: [{ ...resposta().produtos[0], stock: 0 }] }, error: null });
    const r = await lerFamiliaVista(ORG, FAM);
    if ("erro" in r) throw new Error(r.erro);
    expect(r.v.produtos[0]!.stock).toBe(0);
  });

  it("ignora o que não é um produto, um eixo ou um valor válido", async () => {
    base.responder = () => ({ data: { ...resposta(), eixos: [null, { code: "x" }, ...resposta().eixos], produtos: ["lixo", { nome: "sem id" }, ...resposta().produtos] }, error: null });
    const r = await lerFamiliaVista(ORG, FAM);
    if ("erro" in r) throw new Error(r.erro);
    expect(r.v.eixos).toHaveLength(3);
    expect(r.v.produtos).toHaveLength(1);
  });

  it("a função ainda por aplicar na base: erro claro, sem partir", async () => {
    base.responder = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_ler_familia_vista(p_id, p_org) in the schema cache" } });
    const r = await lerFamiliaVista(ORG, FAM);
    expect(r).toEqual({ ok: false, erro: "Ainda não disponível nesta base", codigo: "PGRST202" });
  });

  it("sem permissão (CT001) e família inexistente (CT003): a mensagem em português da base e o código", async () => {
    base.responder = () => ({ data: null, error: { code: "CT001", message: "Sem permissão para ler o catálogo." } });
    expect(await lerFamiliaVista(ORG, FAM)).toMatchObject({ ok: false, erro: "Sem permissão para ler o catálogo.", codigo: "CT001" });
    base.responder = () => ({ data: null, error: { code: "CT003", message: "Família não encontrada." } });
    expect(await lerFamiliaVista(ORG, FAM)).toMatchObject({ ok: false, erro: "Família não encontrada.", codigo: "CT003" });
  });

  it("uma resposta num formato que não se percebe é um erro, não uma página vazia", async () => {
    base.responder = () => ({ data: { familia: null, produtos: "x" }, error: null });
    const r = await lerFamiliaVista(ORG, FAM);
    expect(r).toMatchObject({ ok: false });
  });
});
