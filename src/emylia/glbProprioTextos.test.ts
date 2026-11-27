// 27/11: os textos do GLB próprio nos ecrãs de gestão (o chip da linha, o texto alternativo da pré-visualização e as frases das confirmações). Funções puras.
import { describe, expect, it } from "vitest";
import { chipGlb, fraseDoUso, tamanhoGlb, textoAlternativoGlb } from "./glbProprioTextos";

const CAMINHO = "3242e925-da26-459a-8258-be04d904e355/aaaaaaaa-bbbb-4ccc-8ddd-000000000001.glb";

describe("tamanhoGlb", () => {
  it("em MB com uma casa e vírgula, sem «,0»", () => {
    expect(tamanhoGlb(1_258_291)).toBe("1,2 MB");
    expect(tamanhoGlb(5_242_880)).toBe("5 MB");
    expect(tamanhoGlb(2_621_440)).toBe("2,5 MB");
  });
  it("abaixo de 100 KB, em KB (nunca «0 MB»), e no mínimo 1 KB", () => {
    expect(tamanhoGlb(51_200)).toBe("50 KB");
    expect(tamanhoGlb(12)).toBe("1 KB");
  });
});

describe("chipGlb: o chip de cada linha", () => {
  it("«GLB · 1,2 MB» com ficheiro e tamanho", () => { expect(chipGlb(CAMINHO, 1_258_291)).toBe("GLB · 1,2 MB"); });
  it("«GLB» se há ficheiro e a leitura não trouxe o tamanho", () => { expect(chipGlb(CAMINHO, null)).toBe("GLB"); });
  it("«Sem GLB» sem ficheiro, e também se a leitura não tem a chave (migração por aplicar)", () => {
    expect(chipGlb(null, null)).toBe("Sem GLB");
    expect(chipGlb(undefined, undefined)).toBe("Sem GLB");
  });
});

describe("textoAlternativoGlb: o que o 3D mostra, em texto", () => {
  it("triângulos (com espaço de milhares), tamanho e materiais", () => {
    expect(textoAlternativoGlb({ nome: "SORTY", triangulos: 12_345, bytes: 1_258_291, materiais: ["corpo", "metal"] }))
      .toBe("Pré-visualização do modelo 3D próprio de «SORTY»: 12 345 triângulos, 1,2 MB, materiais: corpo, metal.");
  });
  it("sem materiais com nome, diz-o; um só triângulo no singular", () => {
    expect(textoAlternativoGlb({ nome: "X", triangulos: 1, bytes: 51_200, materiais: [] })).toBe("Pré-visualização do modelo 3D próprio de «X»: 1 triângulo, 50 KB, sem materiais com nome.");
  });
  it("do ficheiro já guardado só se sabe o tamanho", () => {
    expect(textoAlternativoGlb({ nome: "X", bytes: 1_258_291 })).toBe("Pré-visualização do modelo 3D próprio de «X»: 1,2 MB.");
    expect(textoAlternativoGlb({ nome: "X", bytes: null })).toBe("Pré-visualização do modelo 3D próprio de «X».");
  });
});

describe("fraseDoUso: quantos produtos mudam", () => {
  it("diz o número quando a página o sabe, no singular e no plural", () => {
    expect(fraseDoUso("categoria", 12)).toContain("12 produtos");
    expect(fraseDoUso("subcategoria", 1)).toContain("1 produto");
    expect(fraseDoUso("subcategoria", 1)).not.toContain("1 produtos");
  });
  it("zero produtos: diz que nenhum o usa", () => { expect(fraseDoUso("modelo", 0)).toMatch(/nenhum produto/i); });
  it("sem o número (null ou undefined), não inventa um", () => {
    expect(fraseDoUso("categoria", null)).not.toMatch(/\d+ produto/);
    expect(fraseDoUso("categoria", undefined)).not.toMatch(/\d+ produto/);
    expect(fraseDoUso("categoria", null)).toMatch(/produtos/);
  });
  it("lembra o que vence o GLB deste nível: o nível mais próximo do produto", () => {
    expect(fraseDoUso("categoria", 3)).toContain("a subcategoria, o modelo ou o próprio produto");
    expect(fraseDoUso("subcategoria", 3)).toContain("o modelo ou o próprio produto");
    expect(fraseDoUso("modelo", 3)).toContain("o próprio produto");
    expect(fraseDoUso("modelo", 3)).not.toContain("subcategoria");
  });
});
