// O «Modelo 3D» escolhido (produto > subcategoria > categoria) passa por cima do classificador de hoje (modeloDoProduto): o id escolhido manda sobre
// tipoMockupDe; as medidas, a cor e as opções continuam a vir como sempre; sem escolha o resultado é EXACTAMENTE o de hoje.
import { describe, expect, it } from "vitest";
import { modeloDoProduto, tipoMockupDe, type NoCat, type ProdutoCat } from "./catalogo3d";

const ARVORE: NoCat[] = [
  { id: "c1", n: "Casa de banho", pai: null }, { id: "s1", n: "Sanitas", pai: "c1" }, { id: "s2", n: "Peças soltas", pai: "c1" },
];
const p = (n: string, extra: Partial<ProdutoCat> = {}): ProdutoCat => ({ id: "p1", n, no: "s2", ...extra });

describe("sem escolha, o comportamento é exactamente o de hoje", () => {
  const casos: ProdutoCat[] = [p("Sanita suspensa Rimless"), p("Armário de coluna 40x160x25"), p("Produto sem classe"), p("Lava-loiça VELAR 1 CUBA 50"), p("Placa DE INDUÇÃO INDESIT"), p("Frigorífico americano")];
  it("com modelo3d ausente, null, '' ou desconhecido, o resultado é igual ao de um produto sem o campo", () => {
    for (const base of casos) {
      const esperado = modeloDoProduto(base, ARVORE);
      expect(modeloDoProduto({ ...base, modelo3d: null }, ARVORE)).toEqual(esperado);
      expect(modeloDoProduto({ ...base, modelo3d: "" }, ARVORE)).toEqual(esperado);
      expect(esperado.escolha).toBeUndefined();
    }
  });
  it("uma árvore com a chave modelo3d a null ou em falta não muda nada", () => {
    const arv: NoCat[] = ARVORE.map((x) => ({ ...x, modelo3d: null }));
    for (const base of casos) expect(modeloDoProduto(base, arv)).toEqual(modeloDoProduto(base, ARVORE));
  });
  it("um id que a lista não conhece (a base não tem lista fechada) é ignorado: fica o automático", () => {
    const base = p("Sanita suspensa Rimless");
    expect(modeloDoProduto({ ...base, modelo3d: "modelo_inventado" }, ARVORE)).toEqual(modeloDoProduto(base, ARVORE));
  });
});

describe("o modelo escolhido manda sobre o classificador", () => {
  it("no produto: um produto que o classificador deixava em «caixa» passa a sanita, com o genérico e as medidas da sanita", () => {
    const base = p("Peça misteriosa X1");
    expect(tipoMockupDe(base, ARVORE)).toBe("caixa");
    const m = modeloDoProduto({ ...base, modelo3d: "sanita" }, ARVORE);
    expect(m.tipo).toBe("sanita");
    expect(m.mockup3d.generico?.id).toBe("sanita");
    expect(m.escolha).toEqual({ modelo: "sanita", origem: "produto" });
    expect(m.dimensoes).toMatchObject({ larguraCm: 37, profundidadeCm: 65 });
  });
  it("o produto escolhido manda sobre a subcategoria e a categoria", () => {
    const arv: NoCat[] = [{ id: "c1", n: "Casa de banho", pai: null, modelo3d: "banheira" }, { id: "s1", n: "Sanitas", pai: "c1", modelo3d: "bide" }];
    const m = modeloDoProduto({ id: "p", n: "Peça X", no: "s1", modelo3d: "sanita" }, arv);
    expect(m.mockup3d.generico?.id).toBe("sanita");
    expect(m.escolha?.origem).toBe("produto");
  });
  it("herdado da subcategoria", () => {
    const arv: NoCat[] = [{ id: "c1", n: "Casa de banho", pai: null, modelo3d: "banheira" }, { id: "s1", n: "Sanitas", pai: "c1", modelo3d: "bide" }];
    const m = modeloDoProduto({ id: "p", n: "Peça X", no: "s1" }, arv);
    expect(m.tipo).toBe("bide");
    expect(m.mockup3d.generico?.id).toBe("bide");
    expect(m.escolha).toEqual({ modelo: "bide", origem: "subcategoria" });
  });
  it("herdado da categoria, quando a subcategoria não escolheu", () => {
    const arv: NoCat[] = [{ id: "c1", n: "Casa de banho", pai: null, modelo3d: "banheira" }, { id: "s1", n: "Peças", pai: "c1" }];
    const m = modeloDoProduto({ id: "p", n: "Peça X 170x70", no: "s1" }, arv);
    expect(m.tipo).toBe("banheira");
    expect(m.mockup3d.generico?.id).toBe("banheira");
    expect(m.escolha).toEqual({ modelo: "banheira", origem: "categoria" });
    expect(m.dimensoes).toMatchObject({ larguraCm: 170, profundidadeCm: 70, deNome: true });
  });
  it("mantém as medidas do produto (`dim`) e a cor: só muda o modelo", () => {
    const m = modeloDoProduto({ id: "p", n: "Peça X", no: null, modelo3d: "frigorifico", dim: [70, 68, 190] });
    expect(m.mockup3d.generico?.id).toBe("frigorifico");
    expect(m.dimensoes).toMatchObject({ larguraCm: 70, profundidadeCm: 68, alturaCm: 190 });
    expect(m.mockup3d.altura).toBeCloseTo(1.9);
  });
  it("o genérico escolhido não depende do nome: um «Armário» escolhido como coluna de cozinha usa essa categoria", () => {
    const m = modeloDoProduto({ id: "p", n: "Armário simples", no: null, modelo3d: "coluna_cozinha" });
    expect(m.mockup3d.generico?.id).toBe("coluna_cozinha");
  });
  it("as opções do genérico continuam a vir do nome (uma sanita BTW escolhida à mão sem depósito)", () => {
    const m = modeloDoProduto({ id: "p", n: "Peça BTW", no: null, modelo3d: "sanita" });
    expect(m.mockup3d.generico?.o).toMatchObject({ deposito: false });
  });
  it("uma peça de parede escolhida (aplique) fica presa à parede, à altura da categoria", () => {
    const m = modeloDoProduto({ id: "p", n: "Luz qualquer", no: null, modelo3d: "aplique" });
    expect(m.montagem).toBe("parede");
    expect(m.alturaOmissao).toBeCloseTo(1.9);
  });
});

describe("os modelos exactos do catálogo 3D, escolhidos à mão", () => {
  it("html_lava_loica: o produto passa a usar o modelo do HTML do lava-loiça (pelo nome e pela medida)", () => {
    const m = modeloDoProduto({ id: "p", n: "VELAR 1 CUBA 50", no: null, modelo3d: "html_lava_loica" });
    expect(m.tipo).toBe("lava_loica");
    expect(m.mockup3d.params).toMatchObject({ k: "lava_loica", html: { modelo: "velar50", exacto: true } });
    expect(m.escolha).toEqual({ modelo: "html_lava_loica", origem: "produto" });
  });
  it("html_placa: placa do HTML", () => {
    const m = modeloDoProduto({ id: "p", n: "Placa DE INDUÇÃO INDESIT", no: null, modelo3d: "html_placa" });
    expect(m.tipo).toBe("placa");
    expect(m.mockup3d.params).toMatchObject({ k: "placa" });
  });
  it("html_torneira_cozinha: torneira de cozinha do HTML", () => {
    const m = modeloDoProduto({ id: "p", n: "Misturadora ROUND extraível", no: null, modelo3d: "html_torneira_cozinha" });
    expect(m.tipo).toBe("torneira_cozinha");
    expect(m.mockup3d.params).toMatchObject({ k: "torneira", html: { modelo: "round" } });
  });
  it("o genérico escolhido NUNCA leva o modelo do HTML (um lava-loiça escolhido como «sanita» é uma sanita)", () => {
    const m = modeloDoProduto({ id: "p", n: "Lava-loiça VELAR 1 CUBA 50", no: null, modelo3d: "sanita" });
    expect(m.tipo).toBe("sanita");
    expect(m.mockup3d.params).toBeUndefined();
    expect(m.mockup3d.generico?.id).toBe("sanita");
  });
});

describe("os especiais", () => {
  it("«caixa»: caixa com as medidas, sem genérico nem modelo do HTML, mesmo para um nome que o classificador conhecia", () => {
    const m = modeloDoProduto({ id: "p", n: "Sanita suspensa 36x53x40", no: null, modelo3d: "caixa" });
    expect(m.tipo).toBe("caixa");
    expect(m.mockup3d.generico).toBeUndefined();
    expect(m.mockup3d.params).toBeUndefined();
    expect(m.dimensoes).toMatchObject({ larguraCm: 36, profundidadeCm: 53, alturaCm: 40 });
    expect(m.escolha).toEqual({ modelo: "caixa", origem: "produto" });
  });
  it("revestimentos chão e parede: ainda sem desenho próprio, caem na caixa com as medidas (a textura vem da foto, como hoje)", () => {
    for (const id of ["revestimento_chao", "revestimento_parede"]) {
      const m = modeloDoProduto({ id: "p", n: "Azulejo 60x60", no: null, modelo3d: id });
      expect(m.tipo).toBe("caixa");
      expect(m.mockup3d.generico).toBeUndefined();
      expect(m.escolha?.modelo).toBe(id);
    }
  });
});
