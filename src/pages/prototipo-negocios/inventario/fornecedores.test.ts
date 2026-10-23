// O SLA dos fornecedores e o que há por decidir: os números vêm do motor original do mockup, com a mesma seed.
import { describe, expect, it } from "vitest";
import { fresca } from "./ajudaTestes";
import { catalogoPorLigar, margem, portalTexto, posAbertas, precosPorAprovar, slaStats } from "./fornecedores";

describe("fornecedores", () => {
  const db = fresca();
  it("o SLA junta o histórico de exemplo às receções da seed", () => {
    const esperado: Record<string, [number, number, number]> = { alfa: [42, 38, 4], beta: [19, 15, 4], gama: [25, 22, 3], delta: [13, 8, 5], eps: [31, 30, 1], zeta: [16, 14, 2], omega: [0, 0, 0] };
    for (const [id, [rec, inn, out]] of Object.entries(esperado)) expect(slaStats(db, id)).toMatchObject({ rec, inn, out });
    expect(slaStats(db, "alfa").pct).toBeCloseTo(90.47619047619048, 10);
    expect(slaStats(db, "delta").avg).toBeCloseTo(3.076923076923077, 10);
    expect(slaStats(db, "omega").pct).toBe(0);
  });

  it("preços por aprovar, catálogo por ligar e POs abertas", () => {
    expect(precosPorAprovar(db, "alfa")).toHaveLength(4);
    expect(precosPorAprovar(db, "zeta")).toHaveLength(2);
    expect(catalogoPorLigar(db, "alfa")).toHaveLength(3);
    expect(catalogoPorLigar(db, "zeta")).toHaveLength(3);
    expect(posAbertas(db, "alfa")).toBeGreaterThan(0);
    expect(posAbertas(db, "omega")).toBe(0);
  });

  it("a margem e o texto do portal", () => {
    expect(margem(100, 60)).toBe(40);
    expect(margem(0, 5)).toBe(0);
    expect(portalTexto(db.suppliers.find((s) => s.id === "beta")!)).toBe("Convidado · à espera da ficha");
    expect(portalTexto(db.suppliers.find((s) => s.id === "alfa")!)).toBe("Ativo");
    expect(portalTexto(db.suppliers.find((s) => s.id === "delta")!)).toBe("Revogado");
  });
});
