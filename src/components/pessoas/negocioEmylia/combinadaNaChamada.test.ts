// 5/11 (Rúben: «consoante o agendamento da visita recomendar comerciais»): o dia e a hora combinados na chamada entram em
// «Marcar a visita» só se servem; o dia escolhido faz aparecer os comerciais livres nesse dia (QuemPodeIrVisita).
import { describe, expect, it } from "vitest";
import { combinadaNaChamada, periodoDaHora } from "./MarcarVisitaNegocio";

describe("combinadaNaChamada", () => {
  it("dia e hora em HH:MM, nas formas em que se dizem", () => {
    expect(combinadaNaChamada("2026-11-10", "11:00", "2026-11-05")).toEqual({ data: "2026-11-10", hora: "11:00" });
    expect(combinadaNaChamada("2026-11-10", "11", "2026-11-05")).toEqual({ data: "2026-11-10", hora: "11:00" });
    expect(combinadaNaChamada("2026-11-10", "11h30", "2026-11-05")).toEqual({ data: "2026-11-10", hora: "11:30" });
    expect(combinadaNaChamada("2026-11-10", "9h", "2026-11-05")).toEqual({ data: "2026-11-10", hora: "09:00" });
  });

  it("hora que não se percebe: fica só o dia (os comerciais livres aparecem na mesma)", () => {
    expect(combinadaNaChamada("2026-11-10", "de manhã", "2026-11-05")).toEqual({ data: "2026-11-10" });
    expect(combinadaNaChamada("2026-11-10", "25:00", "2026-11-05")).toEqual({ data: "2026-11-10" });
    expect(combinadaNaChamada("2026-11-10", undefined, "2026-11-05")).toEqual({ data: "2026-11-10" });
  });

  it("dia passado, inválido ou em falta: nada (escolhe-se no calendário, como antes)", () => {
    expect(combinadaNaChamada("2026-11-04", "11:00", "2026-11-05")).toEqual({});
    expect(combinadaNaChamada("10 de novembro", "11:00", "2026-11-05")).toEqual({});
    expect(combinadaNaChamada(undefined, "11:00", "2026-11-05")).toEqual({});
  });

  it("hoje ainda serve", () => {
    expect(combinadaNaChamada("2026-11-05", "16:00", "2026-11-05")).toEqual({ data: "2026-11-05", hora: "16:00" });
  });
});

describe("periodoDaHora", () => {
  it("manhã ou tarde, quando só se combinou a parte do dia", () => {
    expect(periodoDaHora("manhã")).toBe("manha");
    expect(periodoDaHora("de manha")).toBe("manha");
    expect(periodoDaHora("à tarde")).toBe("tarde");
    expect(periodoDaHora("11:00")).toBeNull();
    expect(periodoDaHora(undefined)).toBeNull();
  });
});
