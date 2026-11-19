import { afterEach, describe, expect, it } from "vitest";
import { proximosDiasUteis, vagasProximas, vagasVisita } from "./vagasVisita";
import { definirModoReal } from "./acessosPortal";
import { SLOTS } from "./motor";
import { rotuloVaga } from "./vagaData";

afterEach(() => definirModoReal(null));

describe("vagas da visita", () => {
  it("os próximos dias úteis saltam o fim de semana e os feriados (1 de novembro é domingo; 8 de dezembro é feriado)", () => {
    expect(proximosDiasUteis(new Date(2026, 9, 29), 3).map((d) => d.getDate())).toEqual([30, 2, 3]);
    expect(proximosDiasUteis(new Date(2026, 11, 7), 1)[0].getDate()).toBe(9);
  });
  it("a partir de quinta, 29 de outubro: sexta às 10:00 e 15:00 e segunda às 09:30", () => {
    // 19/11 (auditoria): cada vaga com a data completa; o texto só para mostrar
    const v = vagasProximas(new Date(2026, 9, 29, 22, 0));
    expect(v).toEqual([{ data: "2026-10-30", hora: "10:00" }, { data: "2026-10-30", hora: "15:00" }, { data: "2026-11-02", hora: "09:30" }]);
    expect(v.map(rotuloVaga)).toEqual(["sex 30/10 · 10:00", "sex 30/10 · 15:00", "seg 02/11 · 09:30"]);
  });
  it("19/11 (auditoria): no fim do ano, as vagas passam para o ano seguinte com o ano certo", () => {
    expect(vagasProximas(new Date(2026, 11, 31))).toEqual([{ data: "2027-01-04", hora: "10:00" }, { data: "2027-01-04", hora: "15:00" }, { data: "2027-01-05", hora: "09:30" }]);
  });
  it("no protótipo (sem modo real) ficam as da demonstração; numa organização real, as próximas", () => {
    expect(vagasVisita().map(rotuloVaga)).toEqual(SLOTS);
    expect(vagasVisita()[0]).toEqual({ data: "2026-10-15", hora: "10:00" });
    definirModoReal("org-1", "nike");
    expect(vagasVisita(new Date(2026, 9, 29)).map(rotuloVaga)).toEqual(["sex 30/10 · 10:00", "sex 30/10 · 15:00", "seg 02/11 · 09:30"]);
  });
});
