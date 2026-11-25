// A pré-visualização 3D do produto (modeloParaPrevia) usa o modelo resolvido (produto > subcategoria > categoria) e diz-o no estado.
import { describe, expect, it } from "vitest";
import { estadoDoModelo, modeloParaPrevia } from "./previaProduto3d";
import type { NoCat } from "./catalogo3d";

const ARV: NoCat[] = [{ id: "c1", n: "Casa de banho", pai: null, modelo3d: "banheira" }, { id: "s1", n: "Peças", pai: "c1" }];

describe("modeloParaPrevia com Modelo 3D escolhido", () => {
  it("sem escolha, igual a hoje", () => {
    const sem = modeloParaPrevia({ nome: "Peça misteriosa X1", no: null, arvore: [] });
    expect(sem.tipo).toBe("caixa");
    expect(sem.escolha).toBeUndefined();
  });
  it("herda da categoria pela árvore", () => {
    const m = modeloParaPrevia({ nome: "Peça misteriosa X1", no: "s1", arvore: ARV });
    expect(m.tipo).toBe("banheira");
    expect(m.escolha).toEqual({ modelo: "banheira", origem: "categoria" });
  });
  it("o valor do próprio produto (o que se está a escolher no formulário) manda e sobrevive ao recálculo com a medida", () => {
    const m = modeloParaPrevia({ nome: "Peça misteriosa X1", no: "s1", arvore: ARV, modelo3d: "bide", medida: { largura: 40, comprimento: 60, espessura: 45 } });
    expect(m.mockup3d.generico?.id).toBe("bide");
    expect(m.escolha?.origem).toBe("produto");
    expect(m.dimensoes).toMatchObject({ larguraCm: 40, profundidadeCm: 60 });
  });
  it("«caixa» escolhida à mão é a caixa com as medidas (estado «caixa») e mantém a escolha", () => {
    const m = modeloParaPrevia({ nome: "Sanita suspensa", no: null, arvore: [], modelo3d: "caixa" });
    expect(m.tipo).toBe("caixa");
    expect(estadoDoModelo(m)).toBe("caixa");
    expect(m.escolha?.modelo).toBe("caixa");
  });
  it("com o genérico escolhido o estado é «generico»", () => {
    expect(estadoDoModelo(modeloParaPrevia({ nome: "Peça X", no: null, arvore: [], modelo3d: "sanita" }))).toBe("generico");
  });
});
