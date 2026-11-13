// atributosDoProduto: a ÚNICA fonte dos atributos de um produto (medida, cor, nº de cubas, material…). No protótipo deriva-os do nome e do subtipo.
import { describe, expect, it } from "vitest";
import { catalogo0 } from "../v2/catalogoModelo";
import { atributosDoProduto } from "./atributosProduto";

const dos = (n: string, sub?: string) => atributosDoProduto({ n, ...(sub ? { sub } : {}) });

describe("atributosDoProduto: nomes reais do catálogo de exemplo", () => {
  it("Velar: medida, cor «Inox» (vem do subtipo), nº de cubas e material", () => {
    expect(dos("Lava-louças VELAR 1 CUBA 50", "Cubas inox")).toEqual({ Medida: "50 cm", Cor: "Inox", "Nº de cubas": "1 cuba", Material: "Inox" });
  });
  it("Lody com acabamento no fim do nome: a cor é o acabamento", () => {
    expect(dos("Lava-louças Lody 40 - Cobre", "Cubas inox")).toMatchObject({ Medida: "40 cm", Cor: "Cobre" });
  });
  it("Lody PVD: sem acabamento conhecido no nome nem no subtipo não há cor (nada se inventa); com o subtipo «inox» a cor é Inox", () => {
    const a = dos("Lava-louças LODY PVD 1 CUBA 50");
    expect(a).toMatchObject({ Medida: "50 cm", "Nº de cubas": "1 cuba" });
    expect(a).not.toHaveProperty("Cor");
    expect(dos("Lava-louças LODY PVD 1 CUBA 50", "Cubas inox").Cor).toBe("Inox");
  });
  it("Keran com escorredor: medida da frente do nome e 2 cubas", () => {
    expect(dos("Lava-louças KERAN 100 C/ESCORREDOR 2 CUBAS", "Cubas inox")).toMatchObject({ Medida: "100 cm", "Nº de cubas": "2 cubas", Material: "Inox" });
    expect(dos("Lava-louças KERAN 80 C/ESCORREDOR 1 CUBA", "Cubas inox")).toMatchObject({ Medida: "80 cm", "Nº de cubas": "1 cuba" });
  });
  it("Ambar: material compósito, «1.5 CUBA» e medida a seguir a CUBA", () => {
    expect(dos("Lava-louças AMBAR 1.5 CUBA 55", "Cubas compósito")).toMatchObject({ Medida: "55 cm", "Nº de cubas": "1,5 cubas", Material: "Compósito" });
    expect(dos("Lava-louças AMBAR 1 CUBA 40 N", "Cubas compósito")).toMatchObject({ Medida: "40 cm", "Nº de cubas": "1 cuba" });
  });
  it("torneiras Round, Noah, Smooth e Cira: sem medida nem cubas (nada de atributos inventados)", () => {
    for (const n of ["Misturadoras Monocomando Extraível ROUND", "Misturadoras Monocomando NOAH", "Misturadoras Monocomando Extraível SMOOTH", "Misturadoras Monocomando Flexivel CIRA SILICONE EDITION"]) {
      const a = dos(n, "Misturadoras Monocomando");
      expect(a).not.toHaveProperty("Medida");
      expect(a).not.toHaveProperty("Nº de cubas");
    }
  });
  it("torneira com acabamento no nome: a cor vem do nome", () => {
    expect(dos("Misturadoras Monocomando Extraível SMOOTH - Cromo")).toEqual({ Cor: "Cromo" });
  });
  it("medida de três dimensões e produto sem nada reconhecível", () => {
    expect(dos("Móvel baixo 60x45x80 - Branco")).toMatchObject({ Medida: "60×45×80 cm", Cor: "Branco" });
    expect(dos("Cabide SMOOTH", "Cabides")).toEqual({});
  });
  it("entradas estranhas não rebentam: nome vazio, espaços, caracteres especiais", () => {
    expect(dos("")).toEqual({});
    expect(dos("   ")).toEqual({});
    const a = dos("Lava-louças «Ñandú» 50 – Preto 🛁");
    expect(a.Medida).toBe("50 cm");
    expect(a.Cor).toMatch(/^Preto/);
  });
  it("só devolve texto (valores sem espaços nas pontas e nunca vazios)", () => {
    for (const p of catalogo0().produtos.slice(0, 400)) {
      for (const [k, v] of Object.entries(atributosDoProduto(p))) { expect(typeof v).toBe("string"); expect(v).toBe(v.trim()); expect(v).not.toBe(""); expect(k).not.toBe(""); }
    }
  });
  it("é pura: a mesma entrada dá sempre o mesmo resultado e não altera o produto", () => {
    const p = { n: "Lava-louças VELAR 1 CUBA 34", sub: "Cubas inox", marca: "FRASA", sku: "X" };
    const antes = JSON.stringify(p);
    expect(atributosDoProduto(p)).toEqual(atributosDoProduto(p));
    expect(JSON.stringify(p)).toBe(antes);
  });
  it("as cinco Velar do catálogo diferem só na medida", () => {
    const velar = catalogo0().produtos.filter((p) => /lava-lou.as VELAR 1 CUBA/i.test(p.n)).map((p) => atributosDoProduto(p));
    expect(velar.map((a) => a.Medida)).toEqual(["34 cm", "40 cm", "45 cm", "50 cm", "70 cm"]);
    expect(new Set(velar.map((a) => a.Cor))).toEqual(new Set(["Inox"]));
  });
});
