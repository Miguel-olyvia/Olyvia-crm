import { describe, expect, it } from "vitest";
import { lotesDeIds, TAMANHO_LOTE } from "./lotesDeIds";

const ids = (n: number, de = 0): string[] => Array.from({ length: n }, (_, i) => `id-${de + i}`);

describe("lotesDeIds", () => {
  it("o lote tem o tamanho de uma página da lista (100)", () => {
    expect(TAMANHO_LOTE).toBe(100);
  });
  it("sem ids não há lotes", () => {
    expect(lotesDeIds([])).toEqual([]);
  });
  it("uma página cabe num lote só", () => {
    expect(lotesDeIds(ids(100))).toHaveLength(1);
  });
  it("101 ids dão dois lotes, o segundo com um", () => {
    const lotes = lotesDeIds(ids(101));
    expect(lotes.map((l) => l.length)).toEqual([100, 1]);
  });
  it("ids repetidos contam uma vez, e null, undefined e vazios saem", () => {
    expect(lotesDeIds(["a", "b", "a", null, undefined, "", "b", "c"])).toEqual([["a", "b", "c"]]);
  });
  it("mantém a ordem de chegada", () => {
    expect(lotesDeIds(["c", "a", "b"])).toEqual([["c", "a", "b"]]);
  });
  it("não muda a lista original", () => {
    const original = ["a", "a"];
    lotesDeIds(original);
    expect(original).toEqual(["a", "a"]);
  });
});
