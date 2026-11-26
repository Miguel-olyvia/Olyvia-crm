// 26/11: os armazéns que um equipamento do Catálogo pode ter: sem viaturas, pelo nome; e as opções do seletor.
import { describe, expect, it } from "vitest";
import { armazensParaEquipamento, opcoesArmazemEquip } from "./armazensEquipamento";

describe("armazéns dos equipamentos", () => {
  it("tira as viaturas (is_vehicle) e ordena pelo nome; sem is_vehicle conta como armazém", () => {
    const L = armazensParaEquipamento([
      { id: "w3", name: "Porto", code: "POR", is_vehicle: false },
      { id: "v1", name: "Carrinha 12-AB-34", code: null, is_vehicle: true },
      { id: "w1", name: "Évora", code: null },
      { id: "w2", name: "Lisboa", code: null, is_vehicle: null },
    ]);
    expect(L.map((a) => a.id)).toEqual(["w1", "w2", "w3"]);
    expect(armazensParaEquipamento(null)).toEqual([]);
  });
  it("«Sem armazém» primeiro; o código vai entre parênteses; o atual fora da lista fica, com o nome lido", () => {
    const L = [{ id: "w1", nome: "Lisboa", codigo: null }, { id: "w2", nome: "Porto", codigo: "POR" }];
    expect(opcoesArmazemEquip(L)).toEqual([{ v: "", t: "Sem armazém" }, { v: "w1", t: "Lisboa" }, { v: "w2", t: "Porto (POR)" }]);
    expect(opcoesArmazemEquip(L, { id: "w9", nome: "Antigo" }).at(-1)).toEqual({ v: "w9", t: "Antigo" });
    expect(opcoesArmazemEquip(L, { id: "w1", nome: "Lisboa" })).toHaveLength(3);
  });
});
