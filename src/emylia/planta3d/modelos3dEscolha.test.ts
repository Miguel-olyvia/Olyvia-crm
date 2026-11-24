// A escolha do «Modelo 3D» em três níveis com herança (produto > subcategoria > categoria > automático): a lista dos modelos escolháveis e a regra de
// precedência (funções puras, sem React nem base).
import { describe, expect, it } from "vitest";
import { CATEGORIAS_GLB } from "./categoriasGlb";
import {
  GRUPOS_MODELO, ID_CAIXA, ID_REVESTIMENTO_CHAO, ID_REVESTIMENTO_PAREDE, MODELOS_ESCOLHA, ehIdDeModelo3D, escolhaPorId, resolverDoNo, resolverModelo3D, rotuloDoModelo3D, textoDaOrigem,
} from "./modelos3dEscolha";

describe("a lista dos modelos escolháveis", () => {
  it("os ids são únicos e cumprem o formato da base (^[a-z0-9_]{1,40}$)", () => {
    const ids = MODELOS_ESCOLHA.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]{1,40}$/);
  });

  it("traz todos os genéricos de CATEGORIAS_GLB, com o rótulo da categoria", () => {
    expect(CATEGORIAS_GLB.length).toBeGreaterThanOrEqual(35);
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
  it("a precedência não depende de o nível de cima estar na lista: um id novo da base vale", () => {
    expect(resolverModelo3D({ produto: "modelo_novo", categoria: "banheira" })).toEqual({ modelo: "modelo_novo", origem: "produto" });
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
