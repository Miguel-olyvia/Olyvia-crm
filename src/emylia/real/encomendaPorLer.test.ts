// 25/11 (1048): enquanto a encomenda de cliente não chega da base, a obra diz que está a ler (e não «sem materiais»).
import { afterEach, describe, expect, it } from "vitest";
import { definirEncomendasReais, encomendaPorLer } from "./encomendaReal";

afterEach(() => definirEncomendasReais(null));

describe("encomendaPorLer", () => {
  it("só com a conta real, a encomenda emitida e a leitura por chegar", () => {
    definirEncomendasReais(null);
    expect(encomendaPorLer("CT 2026/1048", true)).toBe(true);
    expect(encomendaPorLer("CT 2026/1048", false)).toBe(false); // o protótipo não lê da base
    expect(encomendaPorLer(null, true)).toBe(false); // sem encomenda emitida
    definirEncomendasReais(new Map());
    expect(encomendaPorLer("CT 2026/1048", true)).toBe(false); // já leu (e não há): diz «sem materiais»
  });
});
