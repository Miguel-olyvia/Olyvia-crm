// 27/11 (teste do 1029 no testarh): o contrato dizia «Início a 15/12/2026, com 10 dias úteis de execução: fim previsto a 28/12/2026» e a
// última parcela «No fim, antes da entrega (previsto: ter, 29 dez)». O prazo contava o Natal como dia útil; as parcelas, não.
import { describe, expect, it } from "vitest";
import { fimPrevistoData } from "./propostaDados";

const iso = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null);

describe("o fim previsto do contrato salta os feriados (27/11)", () => {
  it("10 dias úteis a partir de 15/12/2026 acabam a 29/12 (o Natal não conta)", () => {
    expect(iso(fimPrevistoData("2026-12-15", "10"))).toBe("2026-12-29");
  });
  it("sem feriados pelo meio fica como antes: 5 dias úteis de segunda a sexta", () => {
    expect(iso(fimPrevistoData("2027-01-11", "5"))).toBe("2027-01-15");
  });
  it("1 dia útil é o próprio início; sem início ou sem dias, null", () => {
    expect(iso(fimPrevistoData("2026-11-30", "1"))).toBe("2026-11-30");
    expect(fimPrevistoData(undefined, "3")).toBeNull();
    expect(fimPrevistoData("2026-11-30", "")).toBeNull();
  });
});
