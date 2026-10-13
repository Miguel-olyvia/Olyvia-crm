import { describe, expect, it } from "vitest";
import { agruparPorDia } from "./agruparAtividade";
import type { ItemAtividade } from "./pessoasTipos";

const item = (id: string, quando: string): ItemAtividade => ({ id, pessoaId: "a", tipo: "nota", titulo: id, detalhe: "", quando, exemplo: true });

describe("agruparPorDia", () => {
  it("agrupa por dia, do mais recente para o mais antigo, com Hoje e Ontem", () => {
    const g = agruparPorDia([item("1", "2026-10-13"), item("2", "2026-10-13"), item("3", "2026-10-12"), item("4", "2026-10-03")], "2026-10-13");
    expect(g.map((x) => [x.dia, x.relativo, x.itens.map((i) => i.id)])).toEqual([
      ["2026-10-13", "hoje", ["1", "2"]], ["2026-10-12", "ontem", ["3"]], ["2026-10-03", null, ["4"]],
    ]);
  });
  it("ordena os dias mesmo que cheguem desordenados e não altera a entrada", () => {
    const entrada = [item("1", "2026-10-01"), item("2", "2026-10-09")];
    expect(agruparPorDia(entrada, "2026-10-13").map((x) => x.dia)).toEqual(["2026-10-09", "2026-10-01"]);
    expect(entrada.map((i) => i.id)).toEqual(["1", "2"]);
  });
  it("sem itens, sem grupos; um dia futuro não é hoje nem ontem", () => {
    expect(agruparPorDia([], "2026-10-13")).toEqual([]);
    expect(agruparPorDia([item("1", "2026-10-14")], "2026-10-13")[0].relativo).toBeNull();
  });
});
