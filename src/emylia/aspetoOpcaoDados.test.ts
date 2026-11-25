// 25/11: «Tem aspeto» nos atributos (cat_definir_aspeto_atributo) e o aspeto de uma opção (cat_aspeto_opcao). A base é simulada (as migrations A estão por aplicar): confere-se o
// contrato (nome da função e dos argumentos), que '' limpa a superfície, que as recusas CT00x chegam em português e que uma função que ainda não existe diz «ainda não disponível».
import { beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string, a: Record<string, unknown>) => { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f, a); }) },
}));

import { definirAspetoAtributo, definirAspetoOpcao } from "./aspetoOpcaoDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const ATR = "aaaaaaaa-0000-4000-a000-000000000001";
const OPC = "bbbbbbbb-0000-4000-a000-000000000001";

beforeEach(() => { base.chamadas = []; base.responder = () => ({ data: { opcao: { id: OPC, metal: true, superficie: "acetinada" }, anterior: { metal: false, superficie: null } }, error: null }); });

describe("definirAspetoAtributo", () => {
  it("chama cat_definir_aspeto_atributo(p_org, p_atributo, p_tem_aspeto)", async () => {
    base.responder = () => ({ data: { atributo: { id: ATR, tem_aspeto: true } }, error: null });
    const r = await definirAspetoAtributo(ORG, ATR, true);
    expect(base.chamadas).toEqual([{ f: "cat_definir_aspeto_atributo", a: { p_org: ORG, p_atributo: ATR, p_tem_aspeto: true } }]);
    expect(r.ok).toBe(true);
  });
  it("a recusa da base (CT002, medida não tem aspeto) mostra-se tal como vem", async () => {
    base.responder = () => ({ data: null, error: { code: "CT002", message: "Uma medida não tem aspeto." } });
    const r = await definirAspetoAtributo(ORG, ATR, true);
    expect(r).toMatchObject({ ok: false, erro: "Uma medida não tem aspeto.", codigo: "CT002" });
  });
  it("a função ainda não existe (PGRST202): «Ainda não disponível nesta base», não o erro em bruto", async () => {
    base.responder = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_definir_aspeto_atributo" } });
    const r = await definirAspetoAtributo(ORG, ATR, true);
    expect(r).toMatchObject({ ok: false, erro: "Ainda não disponível nesta base" });
  });
});

describe("definirAspetoOpcao", () => {
  it("chama cat_aspeto_opcao(p_org, p_opcao, p_metal, p_superficie) e devolve o novo aspeto e o anterior", async () => {
    const r = await definirAspetoOpcao(ORG, OPC, { metal: true, superficie: "acetinada" });
    expect(base.chamadas).toEqual([{ f: "cat_aspeto_opcao", a: { p_org: ORG, p_opcao: OPC, p_metal: true, p_superficie: "acetinada" } }]);
    expect(r).toEqual({ ok: true, v: { metal: true, superficie: "acetinada", anterior: { metal: false, superficie: null } } });
  });
  it("sem superfície ('nenhuma'): vai '' à base, que limpa; undefined não mexe (null à base)", async () => {
    await definirAspetoOpcao(ORG, OPC, { metal: false, superficie: null });
    await definirAspetoOpcao(ORG, OPC, { metal: true });
    expect(base.chamadas.map((c) => [c.a.p_metal, c.a.p_superficie])).toEqual([[false, ""], [true, null]]);
  });
  it("recusa sem ir à base uma superfície fora das três", async () => {
    const r = await definirAspetoOpcao(ORG, OPC, { metal: false, superficie: "brilhante" as never });
    expect(r.ok).toBe(false);
    expect(base.chamadas).toHaveLength(0);
  });
  it("a recusa da base (CT002: ligue primeiro «Tem aspeto») mostra-se tal como vem", async () => {
    base.responder = () => ({ data: null, error: { code: "CT002", message: "Ligue primeiro «Tem aspeto» no atributo «Cor»." } });
    const r = await definirAspetoOpcao(ORG, OPC, { metal: true, superficie: null });
    expect(r).toMatchObject({ ok: false, erro: "Ligue primeiro «Tem aspeto» no atributo «Cor»." });
  });
  it("uma resposta com valores estranhos não rebenta: metal só true, superfície só uma das três", async () => {
    base.responder = () => ({ data: { opcao: { id: OPC, metal: "sim", superficie: "brilhante" } }, error: null });
    const r = await definirAspetoOpcao(ORG, OPC, { metal: true, superficie: "mate" });
    expect(r).toEqual({ ok: true, v: { metal: false, superficie: null, anterior: { metal: false, superficie: null } } });
  });
});
