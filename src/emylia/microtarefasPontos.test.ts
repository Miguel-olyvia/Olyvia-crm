// 27/11 (Rúben: «ao editar as tasks também devemos poder editar os pontos»): mudar os pontos de uma microtarefa só nesta obra.
import { describe, expect, it } from "vitest";
import { mudarMicro, detalheMicro } from "./microtarefas";
import type { Tarefa } from "./motor";

describe("os pontos de uma microtarefa", () => {
  it("mudam, tiram-se vazios e não mexem se ficarem iguais", () => {
    const t = { nome: "X", svcs: [], dia: 0, dur: 1, sk: "x", h: 8, tec: null, micro: [{ id: 0, n: "Delimitar", det: ["a", "b"] }] } as unknown as Tarefa;
    expect(mudarMicro(t, { k: "pontos", id: 0, det: ["a", "b"] })).toBeNull();
    expect(mudarMicro(t, { k: "pontos", id: 0, det: ["a mudado", "", "c"] })).toMatch(/pontos de «Delimitar» mudaram \(2\)/);
    expect(detalheMicro(t.micro![0]).det).toEqual(["a mudado", "c"]);
  });
});
