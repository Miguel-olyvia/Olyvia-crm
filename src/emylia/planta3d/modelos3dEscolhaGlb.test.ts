// 27/11: a prioridade com o GLB PRÓPRIO: escolha manual do produto (modelo_3d) > Modelo (GLB próprio > id escolhido) > subcategoria (GLB > id) > categoria (GLB > id) > automático.
// O GLB de um nível vence o id do MESMO nível; um id escolhido num nível de cima vence o GLB de um nível de baixo; e sem GLB nenhum dá exactamente o resultado de antes.
import { describe, expect, it } from "vitest";
import { herdadoDe, niveisDoNo, resolverDoNo, resolverGlbDoNo, resolverGlbProprio, textoDoGlb, type NoComModelo } from "./modelos3dEscolha";

const G = (n: string) => `b6ffce4f-f630-4933-833a-008649757a33/aaaaaaaa-bbbb-4ccc-8ddd-${n.padStart(12, "0")}.glb`;

describe("resolverGlbProprio: qual GLB vale", () => {
  it("sem GLB em nenhum nível não há GLB (retrocompatível)", () => {
    expect(resolverGlbProprio({})).toBeNull();
    expect(resolverGlbProprio({ modelo: { nome: "SMOOTH", modelo: "bide" }, subcategoria: { nome: "Bidés" }, categoria: { nome: "Casa de banho", modelo: "sanita" } })).toBeNull();
  });

  it("a escolha manual do produto manda sobre qualquer GLB", () => {
    expect(resolverGlbProprio({ produto: "sanita", modelo: { nome: "SMOOTH", glb: G("1") }, categoria: { nome: "CB", glb: G("2") } })).toBeNull();
  });

  it("um produto sem escolha (vazio, lixo ou id desconhecido) deixa o GLB valer", () => {
    for (const p of [null, undefined, "", "ID COM ESPAÇOS", "id_que_nao_existe"]) {
      expect(resolverGlbProprio({ produto: p, categoria: { nome: "CB", glb: G("2") } })?.glb, String(p)).toBe(G("2"));
    }
  });

  it("o GLB do Modelo vence os de baixo, e diz de onde vem", () => {
    const r = resolverGlbProprio({ modelo: { nome: "SMOOTH", glb: G("1") }, subcategoria: { nome: "Bidés", glb: G("2") }, categoria: { nome: "CB", glb: G("3") } });
    expect(r).toEqual({ glb: G("1"), origem: "modelo", de: "SMOOTH" });
  });

  it("sem GLB no Modelo, vale o da subcategoria; sem esse, o da categoria", () => {
    expect(resolverGlbProprio({ modelo: { nome: "SMOOTH" }, subcategoria: { nome: "Bidés", glb: G("2") }, categoria: { nome: "CB", glb: G("3") } })).toEqual({ glb: G("2"), origem: "subcategoria", de: "Bidés" });
    expect(resolverGlbProprio({ modelo: null, subcategoria: { nome: "Bidés" }, categoria: { nome: "CB", glb: G("3") } })).toEqual({ glb: G("3"), origem: "categoria", de: "CB" });
  });

  it("no MESMO nível o GLB vence o id escolhido", () => {
    expect(resolverGlbProprio({ subcategoria: { nome: "Bidés", modelo: "bide", glb: G("2") } })?.glb).toBe(G("2"));
  });

  it("um id escolhido num nível de cima vence o GLB de um nível de baixo", () => {
    expect(resolverGlbProprio({ modelo: { nome: "SMOOTH", modelo: "bide" }, categoria: { nome: "CB", glb: G("3") } })).toBeNull();
    expect(resolverGlbProprio({ subcategoria: { nome: "Bidés", modelo: "bide" }, categoria: { nome: "CB", glb: G("3") } })).toBeNull();
  });

  it("um id desconhecido num nível não bloqueia o GLB de baixo (o id inválido herda, como sempre)", () => {
    expect(resolverGlbProprio({ modelo: { nome: "SMOOTH", modelo: "nao_existe" }, categoria: { nome: "CB", glb: G("3") } })?.origem).toBe("categoria");
  });
});

describe("resolverGlbDoNo e a árvore", () => {
  const arvore: NoComModelo[] = [
    { id: "cb", n: "Casa de banho", pai: null, modelo3d: null },
    { id: "bides", n: "Bidés", pai: "cb", modelo3d: null },
  ];
  it("lê o GLB da subcategoria e da categoria na árvore (nós com `glb`) e junta o do Modelo", () => {
    const comGlb = arvore.map((n) => (n.id === "cb" ? { ...n, glb: G("3") } : n));
    expect(resolverGlbDoNo({ arvore: comGlb, no: "bides" })?.origem).toBe("categoria");
    expect(resolverGlbDoNo({ arvore: comGlb, no: "bides", modelo: { nome: "SMOOTH", glb: G("1") } })?.origem).toBe("modelo");
    expect(niveisDoNo(comGlb, "bides").categoria).toEqual({ nome: "Casa de banho", modelo: null, glb: G("3") });
  });
  it("a escolha do produto manda, e sem nenhum GLB a árvore resolve como antes", () => {
    expect(resolverGlbDoNo({ produto: "bide", arvore, no: "bides", modelo: { nome: "SMOOTH", glb: G("1") } })).toBeNull();
    expect(resolverGlbDoNo({ arvore, no: "bides" })).toBeNull();
    expect(resolverDoNo({ arvore, no: "bides" })).toEqual({ modelo: null, origem: "automatico", de: null });
    expect(herdadoDe({ subcategoria: { nome: "Bidés", modelo: "bide" } })).toMatchObject({ modelo: "bide", origem: "subcategoria" });
  });
});

describe("textoDoGlb", () => {
  it("diz de onde vem o modelo próprio", () => {
    expect(textoDoGlb({ glb: G("1"), origem: "modelo", de: "SMOOTH" })).toBe("Modelo 3D próprio (do modelo SMOOTH)");
    expect(textoDoGlb({ glb: G("2"), origem: "subcategoria", de: "Bidés" })).toBe("Modelo 3D próprio (da subcategoria Bidés)");
    expect(textoDoGlb({ glb: G("3"), origem: "categoria", de: null })).toBe("Modelo 3D próprio (da categoria)");
  });
});
