import { describe, expect, it } from "vitest";
import { LIMIARES, estadoDaMeta, ritmoEsperado } from "./estadoMeta";

describe("ritmoEsperado", () => {
  it("é o dia do mês sobre os dias do mês, em percentagem", () => {
    expect(ritmoEsperado("2026-10", new Date(2026, 9, 13))).toBeCloseTo((13 / 31) * 100, 5);
    expect(ritmoEsperado("2028-02", new Date(2028, 1, 29))).toBe(100);
    expect(ritmoEsperado("2028-02", new Date(2028, 1, 15))).toBeCloseTo((15 / 29) * 100, 5);
  });

  it("é 0 antes do mês e 100 depois dele", () => {
    expect(ritmoEsperado("2026-10", new Date(2026, 8, 30))).toBe(0);
    expect(ritmoEsperado("2026-10", new Date(2026, 10, 1))).toBe(100);
  });
});

describe("estadoDaMeta", () => {
  it("a partir de 100% está atingida, seja qual for o ritmo", () => {
    expect(estadoDaMeta(100, 100)).toBe("atingida");
    expect(estadoDaMeta(130, 20)).toBe("atingida");
  });

  it("compara a percentagem com o ritmo usando os limiares", () => {
    const ritmo = 50;
    expect(estadoDaMeta(ritmo * LIMIARES.noRitmo, ritmo)).toBe("noRitmo");
    expect(estadoDaMeta(ritmo * LIMIARES.noRitmo - 1, ritmo)).toBe("emRisco");
    expect(estadoDaMeta(ritmo * LIMIARES.emRisco, ritmo)).toBe("emRisco");
    expect(estadoDaMeta(ritmo * LIMIARES.emRisco - 1, ritmo)).toBe("atrasada");
    expect(estadoDaMeta(0, ritmo)).toBe("atrasada");
  });

  it("sem ritmo esperado (antes do mês) está no ritmo", () => {
    expect(estadoDaMeta(0, 0)).toBe("noRitmo");
  });
});
