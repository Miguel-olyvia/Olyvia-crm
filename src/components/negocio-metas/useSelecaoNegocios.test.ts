import { describe, expect, it } from "vitest";
import { alternarSelecao } from "./useSelecaoNegocios";

const inicial = { ids: [] as readonly string[], recusado: false, tentativas: 0 };

describe("alternarSelecao", () => {
  it("junta pela ordem e tira ao repetir", () => {
    const a = alternarSelecao(alternarSelecao(inicial, "a"), "b");
    expect(a.ids).toEqual(["a", "b"]);
    expect(alternarSelecao(a, "a").ids).toEqual(["b"]);
  });
  it("recusa o 4.º e conta cada recusa (tentativas), sem alterar a seleção", () => {
    const tres = ["a", "b", "c"].reduce(alternarSelecao, inicial);
    const r1 = alternarSelecao(tres, "d");
    const r2 = alternarSelecao(r1, "d");
    expect(r1).toMatchObject({ ids: ["a", "b", "c"], recusado: true, tentativas: 1 });
    expect(r2.tentativas).toBe(2);
  });
  it("tirar um negócio limpa a recusa e deixa voltar a escolher", () => {
    const tres = ["a", "b", "c"].reduce(alternarSelecao, inicial);
    const livre = alternarSelecao(alternarSelecao(tres, "d"), "a");
    expect(livre.recusado).toBe(false);
    expect(alternarSelecao(livre, "d").ids).toEqual(["b", "c", "d"]);
  });
});
