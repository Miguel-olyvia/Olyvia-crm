import { describe, expect, it } from "vitest";
import { mesPorOmissao } from "@/components/rh-exemplo/processamento/mesPorOmissao";

describe("mesPorOmissao: o mes de hoje, nao um mes fixo de exemplo", () => {
  it("devolve AAAA-MM do dia dado", () => {
    expect(mesPorOmissao(new Date(2026, 9, 26))).toBe("2026-10");
  });

  it("poe zero a esquerda nos meses de um algarismo", () => {
    expect(mesPorOmissao(new Date(2027, 0, 5))).toBe("2027-01");
  });

  it("nao fica preso a Setembro de 2026", () => {
    expect(mesPorOmissao(new Date(2030, 11, 31))).toBe("2030-12");
  });

  it("sem argumento usa a data actual", () => {
    const hoje = new Date();
    expect(mesPorOmissao()).toBe(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`);
  });
});
