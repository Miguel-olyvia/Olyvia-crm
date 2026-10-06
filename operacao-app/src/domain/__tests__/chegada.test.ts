import { describe, expect, it } from "vitest";
import { primeiraTarefaDoDia, tarefasDeHoje, type TarefaParaChegada } from "../chegada";

const HOJE = "2026-10-06";
const t = (id: string, p: Partial<TarefaParaChegada> = {}): TarefaParaChegada => ({
  id,
  estado: "por_fazer",
  inicio_planeado: HOJE,
  fase_ordem: 1,
  ordem: 1,
  depende_de: null,
  ...p,
});

describe("tarefasDeHoje", () => {
  it("deixa de fora as feitas e as que começam depois de hoje", () => {
    const r = tarefasDeHoje(
      [t("a"), t("b", { estado: "feita" }), t("c", { inicio_planeado: "2026-10-09" }), t("d", { inicio_planeado: null })],
      HOJE
    );
    expect(r.map((x) => x.id)).toEqual(["a", "d"]);
  });
  it("em curso e para refazer contam sempre", () => {
    const r = tarefasDeHoje(
      [t("a", { estado: "em_curso", inicio_planeado: "2026-10-20" }), t("b", { estado: "rejeitada", inicio_planeado: "2026-10-20" })],
      HOJE
    );
    expect(r).toHaveLength(2);
  });
});

describe("primeiraTarefaDoDia", () => {
  it("a em curso primeiro", () => {
    expect(primeiraTarefaDoDia([t("a", { ordem: 1 }), t("b", { estado: "em_curso", ordem: 5 })], HOJE)?.id).toBe("b");
  });
  it("depois a mais cedo no plano", () => {
    expect(
      primeiraTarefaDoDia(
        [t("a", { inicio_planeado: "2026-10-06", ordem: 3 }), t("b", { inicio_planeado: "2026-10-05", ordem: 9 })],
        HOJE
      )?.id
    ).toBe("b");
  });
  it("salta a que depende de uma por fazer", () => {
    expect(primeiraTarefaDoDia([t("a", { ordem: 2 }), t("b", { ordem: 1, depende_de: "a" })], HOJE)?.id).toBe("a");
  });
  it("nada para hoje → null", () => {
    expect(primeiraTarefaDoDia([t("a", { inicio_planeado: "2026-12-01" })], HOJE)).toBeNull();
  });
});
