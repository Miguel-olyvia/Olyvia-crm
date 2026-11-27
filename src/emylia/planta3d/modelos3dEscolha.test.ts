// A escolha do «Modelo 3D» em três níveis com herança (produto > subcategoria > categoria > automático): a lista dos modelos escolháveis e a regra de
// precedência (funções puras, sem React nem base).
import { describe, expect, it } from "vitest";
import { CATEGORIAS_GLB } from "./categoriasGlb";
import {
  GRUPOS_MODELO, ID_CAIXA, ID_REVESTIMENTO_CHAO, ID_REVESTIMENTO_PAREDE, MODELOS_ESCOLHA, ehIdDeModelo3D, escolhaPorId, herdadoDe, resolverDoNo, resolverModelo3D, rotuloAutomatico, rotuloDoModelo3D, textoDaOrigem,
} from "./modelos3dEscolha";

describe("a lista dos modelos escolháveis", () => {
  it("os ids são únicos e cumprem o formato da base (^[a-z0-9_]{1,40}$)", () => {
    const ids = MODELOS_ESCOLHA.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]{1,40}$/);
  });

  it("traz todos os genéricos de CATEGORIAS_GLB, com o rótulo da categoria", () => {
    expect(CATEGORIAS_GLB.length).toBeGreaterThanOrEqual(31);
    for (const c of CATEGORIAS_GLB) {
      const m = MODELOS_ESCOLHA.find((x) => x.id === c.id);
      expect(m, `falta o genérico ${c.id}`).toBeDefined();
      expect(m!.rotulo).toBe(c.rotulo);
    }
  });

  it("traz os 7 genéricos novos ligados (tampo, lava-loiça, máquina de roupa, termoacumulador, aplique, garrafeira, acessório)", () => {
    for (const id of ["tampo_wc", "lava_loica", "maquina_roupa", "termoacumulador", "aplique", "garrafeira", "acessorio"]) expect(escolhaPorId(id)).toBeDefined();
  });

  it("traz os modelos exactos do catálogo 3D (lava-loiça, placa, torneira de cozinha, tampo Coverlam)", () => {
    const html = MODELOS_ESCOLHA.filter((m) => m.familia === "html");
    expect(html.map((m) => m.id).sort()).toEqual(["html_lava_loica", "html_placa", "html_tampo", "html_torneira_cozinha"]);
    expect(rotuloDoModelo3D("html_lava_loica")).toMatch(/Lava-loiça/);
    expect(rotuloDoModelo3D("html_placa")).toMatch(/Placa/);
    expect(rotuloDoModelo3D("html_torneira_cozinha")).toMatch(/Torneira/);
  });

  it("traz os 3 especiais com o rótulo certo", () => {
    expect(ID_CAIXA).toBe("caixa");
    expect(ID_REVESTIMENTO_CHAO).toBe("revestimento_chao");
    expect(ID_REVESTIMENTO_PAREDE).toBe("revestimento_parede");
    expect(rotuloDoModelo3D("revestimento_chao")).toBe("Revestimento no chão");
    expect(rotuloDoModelo3D("revestimento_parede")).toBe("Revestimento na parede");
    expect(rotuloDoModelo3D("caixa")).toBe("Sem modelo (caixa com as medidas)");
  });

  it("cada modelo tem rótulo em português e um grupo conhecido, e a ordem dos grupos não repete", () => {
    expect(new Set(GRUPOS_MODELO).size).toBe(GRUPOS_MODELO.length);
    for (const m of MODELOS_ESCOLHA) {
      expect(m.rotulo.trim().length).toBeGreaterThan(3);
      expect(GRUPOS_MODELO).toContain(m.grupo);
    }
  });

  it("um id que a base tem e a lista não conhece mostra-se pelo próprio id (a base não tem lista fechada)", () => {
    expect(escolhaPorId("modelo_novo_da_base")).toBeUndefined();
    expect(rotuloDoModelo3D("modelo_novo_da_base")).toBe("modelo_novo_da_base");
  });
});

describe("ehIdDeModelo3D", () => {
  it("aceita só texto no formato da base", () => {
    expect(ehIdDeModelo3D("sanita")).toBe(true);
    expect(ehIdDeModelo3D("a1_b2")).toBe(true);
    for (const v of ["", " ", "Sanita", "com espaço", "a-b", "x".repeat(41), null, undefined, 3, {}]) expect(ehIdDeModelo3D(v)).toBe(false);
  });
});

describe("resolverModelo3D: produto > subcategoria > categoria > automático", () => {
  it("o produto manda sobre tudo", () => {
    expect(resolverModelo3D({ produto: "sanita", subcategoria: "bide", categoria: "banheira" })).toEqual({ modelo: "sanita", origem: "produto" });
  });
  it("sem produto, manda a subcategoria", () => {
    expect(resolverModelo3D({ produto: null, subcategoria: "bide", categoria: "banheira" })).toEqual({ modelo: "bide", origem: "subcategoria" });
  });
  it("sem produto nem subcategoria, manda a categoria", () => {
    expect(resolverModelo3D({ produto: undefined, subcategoria: null, categoria: "banheira" })).toEqual({ modelo: "banheira", origem: "categoria" });
  });
  it("sem nada, fica o automático (o classificador de hoje)", () => {
    expect(resolverModelo3D({})).toEqual({ modelo: null, origem: "automatico" });
    expect(resolverModelo3D({ produto: null, subcategoria: null, categoria: null })).toEqual({ modelo: null, origem: "automatico" });
  });
  it("vazio (''), só espaços ou fora do formato herda: não conta como escolha", () => {
    expect(resolverModelo3D({ produto: "", subcategoria: "  ", categoria: "banheira" })).toEqual({ modelo: "banheira", origem: "categoria" });
    expect(resolverModelo3D({ produto: "Sem Formato", subcategoria: "", categoria: "" })).toEqual({ modelo: null, origem: "automatico" });
  });
  it("um id com formato válido mas que a lista não conhece (a base não tem lista fechada) não corta os níveis de cima: passa para o seguinte", () => {
    expect(resolverModelo3D({ produto: "modelo_novo", subcategoria: "bide", categoria: "banheira" })).toEqual({ modelo: "bide", origem: "subcategoria" });
    expect(resolverModelo3D({ produto: "modelo_novo", subcategoria: "outro_novo", categoria: "banheira" })).toEqual({ modelo: "banheira", origem: "categoria" });
    expect(resolverModelo3D({ produto: "modelo_novo", subcategoria: "bide" })).toEqual({ modelo: "bide", origem: "subcategoria" });
  });
  it("se nenhum nível é conhecido, fica o automático", () => {
    expect(resolverModelo3D({ produto: "modelo_novo", categoria: "outro_novo" })).toEqual({ modelo: null, origem: "automatico" });
  });
});

describe("resolverDoNo: de onde vem o modelo herdado", () => {
  const ARV = [
    { id: "c1", n: "Casa de banho", pai: null, modelo3d: "banheira" },
    { id: "s1", n: "Sanitas", pai: "c1", modelo3d: "sanita" },
    { id: "s2", n: "Bidés", pai: "c1" },
    { id: "c2", n: "Cozinha", pai: null },
    { id: "s3", n: "Móveis", pai: "c2", modelo3d: null },
  ];
  it("a subcategoria tem o seu: vem dela", () => {
    expect(resolverDoNo({ arvore: ARV, no: "s1" })).toEqual({ modelo: "sanita", origem: "subcategoria", de: "Sanitas" });
  });
  it("a subcategoria não tem: herda da categoria", () => {
    expect(resolverDoNo({ arvore: ARV, no: "s2" })).toEqual({ modelo: "banheira", origem: "categoria", de: "Casa de banho" });
  });
  it("um produto directamente na categoria herda dela", () => {
    expect(resolverDoNo({ arvore: ARV, no: "c1" })).toEqual({ modelo: "banheira", origem: "categoria", de: "Casa de banho" });
  });
  it("o produto manda sobre a árvore (e `de` fica a null)", () => {
    expect(resolverDoNo({ produto: "bide", arvore: ARV, no: "s1" })).toEqual({ modelo: "bide", origem: "produto", de: null });
  });
  it("nada na árvore: automático; nó desconhecido ou sem nó também", () => {
    expect(resolverDoNo({ arvore: ARV, no: "s3" })).toEqual({ modelo: null, origem: "automatico", de: null });
    expect(resolverDoNo({ arvore: ARV, no: "nao-existe" })).toEqual({ modelo: null, origem: "automatico", de: null });
    expect(resolverDoNo({ arvore: ARV, no: null })).toEqual({ modelo: null, origem: "automatico", de: null });
  });
  it("tolera uma árvore sem a chave modelo3d (a migração ainda não está aplicada)", () => {
    const sem = [{ id: "c", n: "Cat", pai: null }, { id: "s", n: "Sub", pai: "c" }];
    expect(resolverDoNo({ arvore: sem, no: "s" })).toEqual({ modelo: null, origem: "automatico", de: null });
  });
  it("um produto desconhecido com uma subcategoria válida: resolve na subcategoria (e `de` diz qual)", () => {
    expect(resolverDoNo({ produto: "modelo_novo", arvore: ARV, no: "s1" })).toEqual({ modelo: "sanita", origem: "subcategoria", de: "Sanitas" });
  });
  it("uma subcategoria desconhecida herda da categoria", () => {
    const arv = [{ id: "c", n: "Cat", pai: null, modelo3d: "banheira" }, { id: "s", n: "Sub", pai: "c", modelo3d: "modelo_novo" }];
    expect(resolverDoNo({ arvore: arv, no: "s" })).toEqual({ modelo: "banheira", origem: "categoria", de: "Cat" });
  });
  it("ignora o produto quando se pede só o que se herda (para o «Automático (herda: …)»)", () => {
    expect(resolverDoNo({ produto: "bide", arvore: ARV, no: "s1", soHerdado: true })).toEqual({ modelo: "sanita", origem: "subcategoria", de: "Sanitas" });
  });
});

describe("textoDaOrigem", () => {
  it("diz o modelo e de onde vem, em português", () => {
    expect(textoDaOrigem({ modelo: "sanita", origem: "subcategoria", de: "Sanitas" })).toBe("Sanita de chão (da subcategoria Sanitas)");
    expect(textoDaOrigem({ modelo: "banheira", origem: "categoria", de: "Casa de banho" })).toBe("Banheira (da categoria Casa de banho)");
    expect(textoDaOrigem({ modelo: "bide", origem: "produto", de: null })).toBe("Bidé (escolhido neste produto)");
    expect(textoDaOrigem({ modelo: null, origem: "automatico", de: null })).toBe("automático, pelo nome e pela subcategoria");
  });
});

// 27/11: o nível do MODELO (0001 SMOOTH…) entre o produto e a subcategoria: produto > modelo > subcategoria > categoria > automático.
describe("com o nível do Modelo: produto > modelo > subcategoria > categoria > automático", () => {
  it("o produto continua a mandar sobre o modelo", () => {
    expect(resolverModelo3D({ produto: "sanita", modelo: "bide", subcategoria: "lavatorio", categoria: "banheira" })).toEqual({ modelo: "sanita", origem: "produto" });
  });
  it("sem produto, o modelo manda sobre a subcategoria e a categoria", () => {
    expect(resolverModelo3D({ produto: null, modelo: "bide", subcategoria: "lavatorio", categoria: "banheira" })).toEqual({ modelo: "bide", origem: "modelo" });
  });
  it("modelo vazio, só espaços, fora do formato ou desconhecido da lista herda da subcategoria e depois da categoria", () => {
    for (const m of [null, undefined, "", "  ", "Sem Formato", "modelo_novo"]) {
      expect(resolverModelo3D({ modelo: m, subcategoria: "lavatorio", categoria: "banheira" })).toEqual({ modelo: "lavatorio", origem: "subcategoria" });
      expect(resolverModelo3D({ modelo: m, categoria: "banheira" })).toEqual({ modelo: "banheira", origem: "categoria" });
      expect(resolverModelo3D({ modelo: m })).toEqual({ modelo: null, origem: "automatico" });
    }
  });
  it("retrocompatível: sem o nível do modelo dá exactamente o que dava antes", () => {
    for (const n of [
      { produto: "sanita", subcategoria: "bide", categoria: "banheira" }, { produto: null, subcategoria: "bide", categoria: "banheira" },
      { subcategoria: null, categoria: "banheira" }, {}, { produto: "modelo_novo", subcategoria: "bide" },
    ]) expect(resolverModelo3D({ ...n, modelo: null })).toEqual(resolverModelo3D(n));
  });

  const ARV = [
    { id: "c1", n: "Casa de banho", pai: null, modelo3d: "banheira" },
    { id: "s1", n: "Sanitas", pai: "c1", modelo3d: "sanita" },
    { id: "s2", n: "Bidés", pai: "c1" },
  ];
  it("resolverDoNo: o modelo do Modelo vem com o nome dele em `de`", () => {
    expect(resolverDoNo({ arvore: ARV, no: "s1", modelo: { nome: "SMOOTH", modelo: "bide" } })).toEqual({ modelo: "bide", origem: "modelo", de: "SMOOTH" });
  });
  it("resolverDoNo: o produto manda sobre o Modelo; soHerdado ignora o produto mas não o Modelo", () => {
    expect(resolverDoNo({ produto: "prateleira", arvore: ARV, no: "s1", modelo: { nome: "SMOOTH", modelo: "bide" } })).toEqual({ modelo: "prateleira", origem: "produto", de: null });
    expect(resolverDoNo({ produto: "prateleira", arvore: ARV, no: "s1", modelo: { nome: "SMOOTH", modelo: "bide" }, soHerdado: true })).toEqual({ modelo: "bide", origem: "modelo", de: "SMOOTH" });
  });
  it("resolverDoNo: um Modelo sem escolha (ou sem Modelo) herda da árvore como antes", () => {
    expect(resolverDoNo({ arvore: ARV, no: "s1", modelo: { nome: "SMOOTH", modelo: null } })).toEqual({ modelo: "sanita", origem: "subcategoria", de: "Sanitas" });
    expect(resolverDoNo({ arvore: ARV, no: "s2", modelo: { nome: "SMOOTH" } })).toEqual({ modelo: "banheira", origem: "categoria", de: "Casa de banho" });
    expect(resolverDoNo({ arvore: ARV, no: "s2", modelo: null })).toEqual(resolverDoNo({ arvore: ARV, no: "s2" }));
  });
  it("herdadoDe: com o Modelo, vem dele; sem ele, como antes", () => {
    expect(herdadoDe({ modelo: { nome: "SMOOTH", modelo: "bide" }, subcategoria: { nome: "Sanitas", modelo: "sanita" } })).toEqual({ modelo: "bide", origem: "modelo", de: "SMOOTH" });
    expect(herdadoDe({ subcategoria: { nome: "Sanitas", modelo: "sanita" } })).toEqual({ modelo: "sanita", origem: "subcategoria", de: "Sanitas" });
  });
  it("os textos dizem «do modelo» e os de sempre ficam iguais", () => {
    expect(textoDaOrigem({ modelo: "bide", origem: "modelo", de: "SMOOTH" })).toBe("Bidé (do modelo SMOOTH)");
    expect(rotuloAutomatico({ modelo: "bide", origem: "modelo", de: "SMOOTH" })).toBe("Automático (herda: Bidé, do modelo SMOOTH)");
    expect(rotuloAutomatico({ modelo: "sanita", origem: "subcategoria", de: "Sanitas" })).toBe("Automático (herda: Sanita de chão, da subcategoria Sanitas)");
    expect(rotuloAutomatico({ modelo: "banheira", origem: "categoria", de: "Casa de banho" })).toBe("Automático (herda: Banheira, da categoria Casa de banho)");
  });
});
