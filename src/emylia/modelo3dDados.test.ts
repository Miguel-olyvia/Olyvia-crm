// cat_definir_modelo_3d(p_org, p_alvo, p_id, p_modelo) → {alvo, id, modelo, anterior}: o nome e os argumentos (a base é simulada: a migração está por aplicar),
// '' ou null limpam, e as recusas chegam em português.
import { beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string, a: Record<string, unknown>) => { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f, a); }) },
}));

import { definirModelo3d, modelo3dDeLeitura } from "./modelo3dDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const ID = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  base.chamadas = [];
  base.responder = () => ({ data: { alvo: "produto", id: ID, modelo: "sanita", anterior: null }, error: null });
});

describe("definirModelo3d", () => {
  it("chama cat_definir_modelo_3d com a organização, o alvo, o id e o modelo", async () => {
    const r = await definirModelo3d(ORG, "produto", ID, "sanita");
    expect(base.chamadas).toEqual([{ f: "cat_definir_modelo_3d", a: { p_org: ORG, p_alvo: "produto", p_id: ID, p_modelo: "sanita" } }]);
    expect(r).toEqual({ ok: true, v: { alvo: "produto", id: ID, modelo: "sanita", anterior: null } });
  });
  it("a subcategoria é uma categoria: o alvo é 'categoria'", async () => {
    await definirModelo3d(ORG, "categoria", ID, "bide");
    expect(base.chamadas[0].a.p_alvo).toBe("categoria");
  });
  it("null limpa (herda): vai como null à base", async () => {
    base.responder = () => ({ data: { alvo: "produto", id: ID, modelo: null, anterior: "sanita" }, error: null });
    const r = await definirModelo3d(ORG, "produto", ID, null);
    expect(base.chamadas[0].a.p_modelo).toBeNull();
    expect(r).toEqual({ ok: true, v: { alvo: "produto", id: ID, modelo: null, anterior: "sanita" } });
  });
  it("'' e só espaços também limpam (nunca se manda texto vazio)", async () => {
    await definirModelo3d(ORG, "produto", ID, "");
    await definirModelo3d(ORG, "produto", ID, "   ");
    expect(base.chamadas.map((c) => c.a.p_modelo)).toEqual([null, null]);
  });
  it("recusa em português, sem ir à base, um modelo fora do formato ^[a-z0-9_]{1,40}$", async () => {
    const r = await definirModelo3d(ORG, "produto", ID, "Sanita de Chão");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toMatch(/modelo/i);
    expect(base.chamadas).toHaveLength(0);
  });
  it("a função ainda não existe na base (migração por aplicar): frase em português, não o erro em bruto", async () => {
    base.responder = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_definir_modelo_3d in the schema cache" } });
    const r = await definirModelo3d(ORG, "produto", ID, "sanita");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toMatch(/ainda não está disponível|ainda não disponível/i);
    expect(r.ok === false && r.erro).not.toMatch(/Could not find/);
  });
  it("as recusas da base (CT00x) mostram a mensagem que a base deu, em português", async () => {
    base.responder = () => ({ data: null, error: { code: "CT001", message: "Sem permissão para editar o catálogo." } });
    const r = await definirModelo3d(ORG, "produto", ID, "sanita");
    expect(r).toMatchObject({ ok: false, erro: "Sem permissão para editar o catálogo.", codigo: "CT001" });
  });
  it("um erro técnico (rede, constraint) não chega em inglês: frase de reserva", async () => {
    base.responder = () => ({ data: null, error: { code: "23514", message: 'new row for relation "products" violates check constraint "products_modelo_3d_check"' } });
    const r = await definirModelo3d(ORG, "produto", ID, "sanita");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toBe("Não foi possível gravar o modelo 3D.");
  });
  it("uma excepção (sem rede) também volta como frase", async () => {
    base.responder = () => { throw new Error("Failed to fetch"); };
    const r = await definirModelo3d(ORG, "produto", ID, "sanita");
    expect(r).toEqual({ ok: false, erro: "Não foi possível gravar o modelo 3D." });
  });
  it("uma resposta vazia da base é falha, não sucesso", async () => {
    base.responder = () => ({ data: null, error: null });
    const r = await definirModelo3d(ORG, "produto", ID, "sanita");
    expect(r.ok).toBe(false);
  });
});

describe("modelo3dDeLeitura: tolerante à falta da chave", () => {
  it("string no formato → a string; o resto → null", () => {
    expect(modelo3dDeLeitura("sanita")).toBe("sanita");
    for (const v of [undefined, null, "", "  ", 3, {}, "Com Espaço"]) expect(modelo3dDeLeitura(v)).toBeNull();
  });
});
