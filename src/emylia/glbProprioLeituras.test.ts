// As leituras de gestão (cat_ler_categorias_gestao e cat_ler_modelos_gestao) passam a trazer glb_caminho e glb_bytes em cada categoria, subcategoria e Modelo (migration 20270130420000).
// Sem as chaves (a migration por aplicar) ou com lixo, os campos são null e o resto da leitura fica como estava.
import { beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({ resposta: { data: null as unknown, error: null as unknown } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(async () => base.resposta) } }));

import { lerCategoriasGestao } from "./categoriasMarcasGestao";
import { lerModelosGestao } from "./modelosDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const GLB_A = `${ORG}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.glb`;
const GLB_B = `${ORG}/bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee.glb`;

beforeEach(() => { base.resposta = { data: null, error: null }; });

describe("lerCategoriasGestao com o GLB próprio", () => {
  it("lê o GLB da categoria e o de cada subcategoria", async () => {
    base.resposta = { data: { categorias: [{ id: "c1", nome: "Casa de banho", glb_caminho: GLB_A, glb_bytes: 1000, subcategorias: [{ id: "s1", nome: "Bidés", glb_caminho: GLB_B, glb_bytes: 2000 }, { id: "s2", nome: "Sanitas" }] }] }, error: null };
    const r = await lerCategoriasGestao(ORG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.v[0]!;
    expect(c.glbCaminho).toBe(GLB_A); expect(c.glbBytes).toBe(1000);
    expect(c.subcategorias[0]!.glbCaminho).toBe(GLB_B); expect(c.subcategorias[0]!.glbBytes).toBe(2000);
    expect(c.subcategorias[1]!.glbCaminho).toBeNull(); expect(c.subcategorias[1]!.glbBytes).toBeNull();
  });
  it("sem as chaves (migration por aplicar) ou com lixo, é null e o resto fica igual", async () => {
    base.resposta = { data: { categorias: [{ id: "c1", nome: "Cozinha", glb_caminho: "isto/nao.glb", glb_bytes: "muito" }] }, error: null };
    const r = await lerCategoriasGestao(ORG);
    if (!r.ok) throw new Error("devia ler");
    expect(r.v[0]).toMatchObject({ id: "c1", nome: "Cozinha", glbCaminho: null, glbBytes: null, subcategorias: [] });
  });
});

describe("lerModelosGestao com o GLB próprio", () => {
  const modelo = (extra: Record<string, unknown>) => ({ id: "m1", nome: "SMOOTH", numero: 1, ativo: true, usados: 3, subcategoria: { id: "s1", nome: "Bidés" }, categoria: { id: "c1", nome: "Casa de banho" }, ...extra });
  it("lê o GLB do Modelo", async () => {
    base.resposta = { data: { modelos: [modelo({ glb_caminho: GLB_A, glb_bytes: 4096 })] }, error: null };
    const r = await lerModelosGestao(ORG);
    if (!r.ok) throw new Error("devia ler");
    expect(r.v[0]).toMatchObject({ id: "m1", glbCaminho: GLB_A, glbBytes: 4096 });
  });
  it("sem as chaves, é null", async () => {
    base.resposta = { data: { modelos: [modelo({})] }, error: null };
    const r = await lerModelosGestao(ORG);
    if (!r.ok) throw new Error("devia ler");
    expect(r.v[0]).toMatchObject({ id: "m1", glbCaminho: null, glbBytes: null });
  });
  it("caminho sem tamanho: cada campo lê-se por si (o par é garantido pela base, não pela leitura)", async () => {
    base.resposta = { data: { modelos: [modelo({ glb_caminho: GLB_A })] }, error: null };
    const r = await lerModelosGestao(ORG);
    if (!r.ok) throw new Error("devia ler");
    expect(r.v[0]).toMatchObject({ glbCaminho: GLB_A, glbBytes: null });
  });
});
