import { describe, it, expect } from "vitest";
import {
  getDayWindow,
  shiftDays,
  isSameLocalDay,
  getAgendaQueryRange,
  OVERDUE_LOOKBACK_DAYS,
} from "@/lib/agenda/dayWindow";

describe("getDayWindow", () => {
  it("marca as fronteiras do dia na hora LOCAL, não em UTC", () => {
    const reference = new Date(2026, 8, 1, 14, 37, 12, 345); // 1 Set 2026, hora local
    const { start, end } = getDayWindow(reference);

    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(8);
    expect(start.getDate()).toBe(1);
    expect([start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds()]).toEqual([0, 0, 0, 0]);
    expect([end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds()]).toEqual([23, 59, 59, 999]);
  });

  it("não muta a data recebida", () => {
    const reference = new Date(2026, 8, 1, 14, 0, 0);
    const snapshot = reference.getTime();
    getDayWindow(reference);
    expect(reference.getTime()).toBe(snapshot);
  });

  it("contém um instante timestamptz do próprio dia e exclui o do dia seguinte", () => {
    const { start, end } = getDayWindow(new Date(2026, 8, 1, 9, 0, 0));
    const meioDia = new Date(2026, 8, 1, 12, 0, 0);
    const madrugadaSeguinte = new Date(2026, 8, 2, 0, 0, 0);

    expect(meioDia >= start && meioDia <= end).toBe(true);
    expect(madrugadaSeguinte > end).toBe(true);
  });
});

describe("shiftDays", () => {
  it("navega ontem e amanhã", () => {
    const hoje = new Date(2026, 8, 1, 10, 0, 0);
    expect(shiftDays(hoje, -1).getDate()).toBe(31);
    expect(shiftDays(hoje, -1).getMonth()).toBe(7);
    expect(shiftDays(hoje, 1).getDate()).toBe(2);
  });

  it("atravessa a mudança de hora sem saltar um dia", () => {
    // Último domingo de Outubro: em Lisboa o dia tem 25 horas.
    const vespera = new Date(2026, 9, 24, 12, 0, 0);
    const seguinte = shiftDays(vespera, 1);
    expect(seguinte.getDate()).toBe(25);
    const depois = shiftDays(seguinte, 1);
    expect(depois.getDate()).toBe(26);
  });

  it("não muta a data recebida", () => {
    const hoje = new Date(2026, 8, 1, 10, 0, 0);
    const snapshot = hoje.getTime();
    shiftDays(hoje, 5);
    expect(hoje.getTime()).toBe(snapshot);
  });
});

describe("isSameLocalDay", () => {
  it("compara pelo dia local e não pelo instante", () => {
    expect(isSameLocalDay(new Date(2026, 8, 1, 0, 5), new Date(2026, 8, 1, 23, 55))).toBe(true);
    expect(isSameLocalDay(new Date(2026, 8, 1, 23, 59), new Date(2026, 8, 2, 0, 1))).toBe(false);
  });
});

describe("getAgendaQueryRange", () => {
  it("recua o período de atrasados e termina no fim do dia visível", () => {
    const window = getDayWindow(new Date(2026, 8, 1, 10, 0, 0));
    const range = getAgendaQueryRange(window, 30);

    const from = new Date(range.fromIso);
    expect(from.getTime()).toBe(new Date(2026, 7, 2, 0, 0, 0, 0).getTime());
    expect(new Date(range.toIso).getTime()).toBe(window.end.getTime());
  });

  it("usa o lookback por omissão quando nenhum é dado", () => {
    const window = getDayWindow(new Date(2026, 8, 1, 10, 0, 0));
    const explicito = getAgendaQueryRange(window, OVERDUE_LOOKBACK_DAYS);
    expect(getAgendaQueryRange(window)).toEqual(explicito);
  });

  it("trata um lookback negativo como recuo, nunca como avanço", () => {
    const window = getDayWindow(new Date(2026, 8, 1, 10, 0, 0));
    const range = getAgendaQueryRange(window, -7);
    expect(new Date(range.fromIso).getTime()).toBeLessThan(window.start.getTime());
  });
});
