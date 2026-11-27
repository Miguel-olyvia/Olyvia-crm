// O GLB próprio que vale para um produto, resolvido com os dados que o Catálogo já lê (categorias e Modelos de gestão), UMA leitura por organização e nunca por produto.
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as string[],
  categorias: [] as unknown[],
  modelos: [] as unknown[],
  falhar: false,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (f: string) => {
      base.chamadas.push(f);
      if (base.falhar) return { data: null, error: { code: "42501", message: "sem permissão" } };
      return { data: f === "cat_ler_categorias_gestao" ? { categorias: base.categorias } : { modelos: base.modelos }, error: null };
    }),
    storage: { from: (b: string) => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.teste/${b}/${p}` } }) }) },
  },
}));

import { invalidarGlbsDoCatalogo, lerGlbsDoCatalogo } from "./glbCatalogoCache";
import { resolverGlbDaLeitura, useGlbDoProduto } from "./glbDoProduto";
import type { NoCat } from "./planta3d/catalogo3d";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const G = (n: string) => `${ORG}/aaaaaaaa-bbbb-4ccc-8ddd-${n.padStart(12, "0")}.glb`;
const URL_DE = (n: string) => `https://cdn.teste/catalogo-modelos3d/${G(n)}`;
const arvore: NoCat[] = [{ id: "n-cb", n: "Casa de banho", pai: null }, { id: "n-bides", n: "Bidés", pai: "n-cb" }];

const categoria = (extra: Record<string, unknown> = {}, sub: Record<string, unknown> = {}) => ({
  id: "c1", nome: "Casa de banho", ...extra,
  subcategorias: [{ id: "s1", nome: "Bidés", ...sub }, { id: "s2", nome: "Sanitas" }],
});
const modelo = (extra: Record<string, unknown> = {}) => ({ id: "m1", nome: "SMOOTH", numero: 1, ativo: true, usados: 0, subcategoria: { id: "s1", nome: "Bidés" }, categoria: { id: "c1", nome: "Casa de banho" }, ...extra });
const entrada = { org: ORG, modeloId: null as string | null, no: "n-bides", arvore };

beforeEach(() => { base.chamadas = []; base.categorias = []; base.modelos = []; base.falhar = false; invalidarGlbsDoCatalogo(); });

describe("resolverGlbDaLeitura: a prioridade com os dados de gestão", () => {
  const ler = async () => (await lerGlbsDoCatalogo(ORG))!;

  it("o GLB do Modelo do produto vence o da subcategoria e o da categoria", async () => {
    base.categorias = [categoria({ glb_caminho: G("3"), glb_bytes: 100 }, { glb_caminho: G("2"), glb_bytes: 100 })];
    base.modelos = [modelo({ glb_caminho: G("1"), glb_bytes: 100 })];
    expect(resolverGlbDaLeitura(await ler(), { ...entrada, modeloId: "m1" })).toEqual({ glb: G("1"), origem: "modelo", de: "SMOOTH" });
  });
  it("sem Modelo (ou sem GLB nele) vale o da subcategoria; sem esse, o da categoria", async () => {
    base.categorias = [categoria({ glb_caminho: G("3"), glb_bytes: 100 }, { glb_caminho: G("2"), glb_bytes: 100 })];
    base.modelos = [modelo()];
    expect(resolverGlbDaLeitura(await ler(), { ...entrada, modeloId: "m1" })?.origem).toBe("subcategoria");
    expect(resolverGlbDaLeitura(await ler(), entrada)?.origem).toBe("subcategoria");
    base.categorias = [categoria({ glb_caminho: G("3"), glb_bytes: 100 })];
    invalidarGlbsDoCatalogo(ORG);
    expect(resolverGlbDaLeitura(await ler(), entrada)).toEqual({ glb: G("3"), origem: "categoria", de: "Casa de banho" });
  });
  it("a escolha manual do produto manda: nenhum GLB", async () => {
    base.categorias = [categoria({ glb_caminho: G("3"), glb_bytes: 100 })];
    expect(resolverGlbDaLeitura(await ler(), { ...entrada, modelo3d: "bide" })).toBeNull();
  });
  it("um id escolhido num nível de cima vence o GLB de baixo; no mesmo nível o GLB vence o id", async () => {
    base.categorias = [categoria({ glb_caminho: G("3"), glb_bytes: 100 }, { modelo3d: "bide" })];
    expect(resolverGlbDaLeitura(await ler(), entrada)).toBeNull();
    base.categorias = [categoria({}, { modelo3d: "bide", glb_caminho: G("2"), glb_bytes: 100 })];
    invalidarGlbsDoCatalogo(ORG);
    expect(resolverGlbDaLeitura(await ler(), entrada)?.glb).toBe(G("2"));
  });
  it("um nó de topo (só categoria) e um nó que não existe nas categorias de gestão", async () => {
    base.categorias = [categoria({ glb_caminho: G("3"), glb_bytes: 100 })];
    expect(resolverGlbDaLeitura(await ler(), { ...entrada, no: "n-cb" })?.origem).toBe("categoria");
    expect(resolverGlbDaLeitura(await ler(), { ...entrada, no: "n-nada" })).toBeNull();
    expect(resolverGlbDaLeitura(await ler(), { ...entrada, no: null })).toBeNull();
  });
  it("nomes repetidos (ambíguo) não adivinham: sem GLB de categoria, mas o do Modelo continua a valer", async () => {
    base.categorias = [categoria({ glb_caminho: G("3"), glb_bytes: 100 }), { ...categoria({ glb_caminho: G("4"), glb_bytes: 100 }), id: "c2" }];
    base.modelos = [modelo({ glb_caminho: G("1"), glb_bytes: 100 })];
    expect(resolverGlbDaLeitura(await ler(), entrada)).toBeNull();
    expect(resolverGlbDaLeitura(await ler(), { ...entrada, modeloId: "m1" })?.origem).toBe("modelo");
  });
  it("sem leitura (a base não respondeu) não há GLB", () => {
    expect(resolverGlbDaLeitura(null, entrada)).toBeNull();
  });
});

describe("lerGlbsDoCatalogo: uma leitura por organização", () => {
  it("lê as duas funções uma só vez, mesmo com muitos pedidos, e guarda em memória", async () => {
    await Promise.all([lerGlbsDoCatalogo(ORG), lerGlbsDoCatalogo(ORG), lerGlbsDoCatalogo(ORG)]);
    await lerGlbsDoCatalogo(ORG);
    expect(base.chamadas.sort()).toEqual(["cat_ler_categorias_gestao", "cat_ler_modelos_gestao"]);
  });
  it("uma leitura que falha não fica guardada (tenta-se de novo) e dá null", async () => {
    base.falhar = true;
    expect(await lerGlbsDoCatalogo(ORG)).toBeNull();
    base.falhar = false;
    expect(await lerGlbsDoCatalogo(ORG)).not.toBeNull();
  });
});

describe("useGlbDoProduto", () => {
  it("devolve o GLB com o URL público quando algum nível o tem", async () => {
    base.categorias = [categoria({}, { glb_caminho: G("2"), glb_bytes: 100 })];
    const { result } = renderHook(() => useGlbDoProduto(entrada));
    expect(result.current).toBeNull(); // enquanto lê, o genérico de sempre
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toEqual({ glb: G("2"), origem: "subcategoria", de: "Bidés", url: URL_DE("2") });
  });
  it("sem organização (o protótipo, o formulário sem base) não lê nada nem devolve GLB", async () => {
    const { result } = renderHook(() => useGlbDoProduto({ ...entrada, org: null }));
    await Promise.resolve();
    expect(result.current).toBeNull();
    expect(base.chamadas).toHaveLength(0);
  });
  it("com a escolha manual do produto nem vai à base (o GLB não pode valer)", async () => {
    renderHook(() => useGlbDoProduto({ ...entrada, modelo3d: "sanita" }));
    await Promise.resolve();
    expect(base.chamadas).toHaveLength(0);
  });
  it("se a leitura falhar, não há GLB e nada rebenta", async () => {
    base.falhar = true;
    const { result } = renderHook(() => useGlbDoProduto(entrada));
    await waitFor(() => expect(base.chamadas.length).toBeGreaterThan(0));
    expect(result.current).toBeNull();
  });
  it("muda de organização: lê a nova e esquece a antiga", async () => {
    base.categorias = [categoria({ glb_caminho: G("3"), glb_bytes: 100 })];
    const { result, rerender } = renderHook((p: { org: string | null }) => useGlbDoProduto({ ...entrada, no: "n-cb", org: p.org }), { initialProps: { org: ORG as string | null } });
    await waitFor(() => expect(result.current?.glb).toBe(G("3")));
    rerender({ org: null });
    await waitFor(() => expect(result.current).toBeNull());
  });
});
