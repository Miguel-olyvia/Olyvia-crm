// O que o 3D recebe do produto escolhido na vista da família: a cor (hex) do eixo de cor, a foto da opção como textura, a medida e a «Aplicação», e o nó da árvore
// de categorias (a classificação do 3D, que decide por exemplo que um revestimento é uma superfície e não uma caixa).
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ getPublicUrl: (c: string) => ({ data: { publicUrl: `https://cdn.teste/${c}` } }) }) } } }));

import { LADO_TEXTURA_CM } from "../planta3d/texturaProduto";
import { noDoProduto, previaDoProduto } from "./previaDoProduto";
import { A_COR, A_MED, A_TEX, EIXO_COR, EIXO_MED, EIXO_TEX, eixo, produto, valor } from "./fixturesFamiliaVista";

const MEDIDA = { atributoId: A_MED, valor: { tipo: "2D", largura: 70, comprimento: 100, unidade: "cm" }, unidade: "cm", texto: "70×100 cm" };
const ANTRACITA = valor("ANTRACITA", { hex: "#645E5E" }), LISO = valor("Liso");
const eixos = [EIXO_COR, EIXO_MED, EIXO_TEX];
const base = produto("p1", { [A_COR]: ANTRACITA, [A_TEX]: LISO }, { medida: MEDIDA });

describe("previaDoProduto", () => {
  it("a cor é o hex da opção escolhida no eixo de cor, e a medida vem do JSON da base (cm)", () => {
    const r = previaDoProduto(base, eixos, [base]);
    expect(r.cor).toBe("#645E5E");
    expect(r.medida).toEqual({ largura: 70, comprimento: 100 });
    expect(r.medidaRevestimento).toEqual({ ladoCm: [70, 100] });
    expect(r.textura).toBeUndefined();
    expect(r.aplicacao).toBeNull();
  });

  it("27/11 o atributo «Textura» sem foto escolhe o produto mas não dá cor nem foto", () => {
    const so = produto("p2", { [A_TEX]: valor("Pizarra", { hex: null }) });
    const r = previaDoProduto(so, [EIXO_TEX], [so]);
    expect(r.cor).toBeUndefined();
    expect(r.textura).toBeUndefined();
  });

  it("27/11 a «Textura» COM foto dá a foto ao 3D, tingida pela cor; a cor continua a vir do eixo de Cor (Antracite), nunca da Textura", () => {
    const p = produto("p2b", { [A_COR]: ANTRACITA, [A_TEX]: valor("Pizarra", { foto: "org/pizarra.webp", hex: "#222222" }) });
    const r = previaDoProduto(p, [EIXO_COR, EIXO_TEX], [p]);
    expect(r.cor).toBe("#645E5E");
    expect(r.textura).toEqual({ url: "https://cdn.teste/org/pizarra.webp", ladoCm: LADO_TEXTURA_CM, tingir: true });
  });

  it("27/11 a «Textura» com foto e hex (alguém pôs um hex) nunca é a fonte da cor, mesmo sem eixo de Cor; a foto fica pura (sem cor para tingir)", () => {
    const p = produto("p2c", { [A_TEX]: valor("Pizarra", { foto: "org/pizarra.webp", hex: "#222222" }) });
    const r = previaDoProduto(p, [EIXO_TEX], [p]);
    expect(r.cor).toBeUndefined();
    expect(r.textura).toEqual({ url: "https://cdn.teste/org/pizarra.webp", ladoCm: LADO_TEXTURA_CM });
  });

  it("27/11 a foto da Textura ganha à foto da Cor; uma opção de Textura sem foto deixa a foto da Cor como está", () => {
    const comFoto = produto("p2d", { [A_COR]: valor("NOGAL", { hex: "#8b5a2b", foto: "org/nogal.webp" }), [A_TEX]: valor("Pizarra", { foto: "org/pizarra.webp" }) });
    expect(previaDoProduto(comFoto, [EIXO_COR, EIXO_TEX], [comFoto]).textura).toEqual({ url: "https://cdn.teste/org/pizarra.webp", ladoCm: LADO_TEXTURA_CM, tingir: true });
    const liso = produto("p2e", { [A_COR]: valor("NOGAL", { hex: "#8b5a2b", foto: "org/nogal.webp" }), [A_TEX]: valor("Liso") });
    expect(previaDoProduto(liso, [EIXO_COR, EIXO_TEX], [liso]).textura).toEqual({ url: "https://cdn.teste/org/nogal.webp", ladoCm: LADO_TEXTURA_CM });
  });

  it("uma cor dupla (vários hex numa opção) usa a primeira", () => {
    const p = produto("p3", { [A_COR]: valor("BRANCO/PRETO", { hex: "#F5F5F0, #000000" }) });
    expect(previaDoProduto(p, [EIXO_COR], [p]).cor).toBe("#F5F5F0");
  });

  it("um hex inválido não pinta nada (fica a cor do tipo)", () => {
    const p = produto("p4", { [A_COR]: valor("X", { hex: "vermelho" }) });
    expect(previaDoProduto(p, [EIXO_COR], [p]).cor).toBeUndefined();
  });

  it("o «Acabamento da cor» (metal) manda sobre a «Cor», como na ficha", () => {
    const acab = eixo("at-acab", "acabamento_da_cor", "Acabamento da cor", 1);
    const p = produto("p5", { [A_COR]: ANTRACITA, "at-acab": valor("Cobre", { hex: "#B87333", isMetal: true }) });
    expect(previaDoProduto(p, [EIXO_COR, acab], [p]).cor).toBe("#B87333");
  });

  it("a foto da opção de cor passa a textura do 3D (URL do storage)", () => {
    const p = produto("p6", { [A_COR]: valor("CARVALHO", { hex: "#AA8855", foto: "org/uuid.webp" }) });
    expect(previaDoProduto(p, [EIXO_COR], [p]).textura).toEqual({ url: "https://cdn.teste/org/uuid.webp", ladoCm: LADO_TEXTURA_CM });
  });

  it("sem medida, ou com uma medida ilegível, não há medida (o 3D usa o nome e as omissões do tipo)", () => {
    expect(previaDoProduto(produto("p7", {}), eixos, []).medida).toBeNull();
    expect(previaDoProduto(produto("p8", {}, { medida: { ...MEDIDA, valor: "lixo" } }), eixos, []).medida).toBeNull();
  });

  it("a «Aplicação» (Pavimento, Parede) vai para o 3D pelo nome da opção", () => {
    const p = produto("p9", {}, { aplicacao: { valor: "PAVIMENTO", nome: "Pavimento" } });
    expect(previaDoProduto(p, eixos, [p]).aplicacao).toBe("Pavimento");
  });
});

describe("noDoProduto: o nó da árvore de categorias", () => {
  const cats = [{ id: "n-s1", origem: "s1" }, { id: "n-c1", origem: "c1" }];
  it("a subcategoria, pelo id do nó quando difere do id da base (origem)", () => {
    expect(noDoProduto(produto("a", {}, { subcategoriaId: "s1", categoriaId: "c1" }), cats)).toBe("n-s1");
  });
  it("sem nó com essa origem fica o id da base, como a ficha faz", () => {
    expect(noDoProduto(produto("a", {}, { subcategoriaId: "s9" }), cats)).toBe("s9");
  });
  it("sem subcategoria vale a categoria; sem nenhuma, null", () => {
    expect(noDoProduto(produto("a", {}, { categoriaId: "c1" }), cats)).toBe("n-c1");
    expect(noDoProduto(produto("a", {}), cats)).toBeNull();
  });
});
