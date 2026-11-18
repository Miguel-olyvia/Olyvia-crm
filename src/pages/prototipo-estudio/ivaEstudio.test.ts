// 18/11 (Rúben: «IVA por linha, 6% para serviços»): o IVA do Estúdio linha a linha.
import { describe, expect, it } from "vitest";
import { IVA_MAT, IVA_MO } from "@/emylia/motor";
import { IVA_PECAS, IVA_TRABALHOS, taxaDoGrupo, totaisPorTaxa } from "./ivaEstudio";
import { totais, type Linha } from "./necessidadesEstudio";

const linha = (id: string, grupo: Linha["grupo"], total: number, fora = false): Linha => ({ id, grupo, n: id, q: 1, un: "un", unit: total, total, porque: "", fora });

describe("o IVA do Estúdio por linha", () => {
  it("as mesmas taxas da proposta do negócio: os trabalhos a 6%, as peças e os materiais a 23%", () => {
    expect(IVA_TRABALHOS).toBe(IVA_MO);
    expect(IVA_PECAS).toBe(IVA_MAT);
    expect(taxaDoGrupo("Trabalhos")).toBe(0.06);
    expect(taxaDoGrupo("Montagem")).toBe(0.06);
    expect(taxaDoGrupo("Peças")).toBe(0.23);
    expect(taxaDoGrupo("Materiais")).toBe(0.23);
  });

  it("o cartão da imagem do Rúben: 1905,28 + 368,70 a 23% e 2801,52 a 6%", () => {
    const t = totais([linha("p", "Peças", 1905.28), linha("m", "Materiais", 368.70), linha("t", "Trabalhos", 2801.52)]);
    expect(t.semIva).toBe(5075.5);
    expect(t.taxas).toEqual([
      { taxa: 0.06, base: 2801.52, iva: 168.09 },
      { taxa: 0.23, base: 2273.98, iva: 523.02 },
    ]);
    expect(t.iva).toBe(691.11);
    expect(t.comIva).toBe(5766.61);
  });

  it("as linhas tiradas não contam, e uma taxa sem valor não aparece", () => {
    const t = totais([linha("p", "Peças", 100), linha("t", "Trabalhos", 50, true)]);
    expect(t.taxas).toEqual([{ taxa: 0.23, base: 100, iva: 23 }]);
    expect(t.comIva).toBe(123);
    expect(totais([])).toEqual({ semIva: 0, iva: 0, comIva: 0, taxas: [] });
  });

  it("o IVA arredonda-se por taxa, e o total é a soma do sem IVA com os IVAs", () => {
    const t = totaisPorTaxa([{ total: 10.05, taxa: 0.06 }, { total: 10.05, taxa: 0.06 }, { total: 0.1, taxa: 0.23 }]);
    expect(t.taxas).toEqual([{ taxa: 0.06, base: 20.1, iva: 1.21 }, { taxa: 0.23, base: 0.1, iva: 0.02 }]);
    expect(t.comIva).toBe(Math.round((t.semIva + t.iva) * 100) / 100);
  });
});
