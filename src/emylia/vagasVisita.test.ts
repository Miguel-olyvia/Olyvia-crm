import { afterEach, describe, expect, it } from "vitest";
import { proximosDiasUteis, vagasProximas, vagasVisita } from "./vagasVisita";
import { definirModoReal } from "./acessosPortal";
import { SLOTS } from "./motor";

afterEach(() => definirModoReal(null));

describe("vagas da visita", () => {
  it("os próximos dias úteis saltam o fim de semana e os feriados (1 de novembro é domingo; 8 de dezembro é feriado)", () => {
    expect(proximosDiasUteis(new Date(2026, 9, 29), 3).map((d) => d.getDate())).toEqual([30, 2, 3]);
    expect(proximosDiasUteis(new Date(2026, 11, 7), 1)[0].getDate()).toBe(9);
  });
  it("a partir de quinta, 29 de outubro: sexta às 10:00 e 15:00 e segunda às 09:30", () => {
    expect(vagasProximas(new Date(2026, 9, 29, 22, 0))).toEqual(["sex 30/10 · 10:00", "sex 30/10 · 15:00", "seg 02/11 · 09:30"]);
  });
  it("no protótipo (sem modo real) ficam as da demonstração; numa organização real, as próximas", () => {
    expect(vagasVisita()).toBe(SLOTS);
    definirModoReal("org-1", "nike");
    expect(vagasVisita(new Date(2026, 9, 29))).toEqual(["sex 30/10 · 10:00", "sex 30/10 · 15:00", "seg 02/11 · 09:30"]);
  });
});
