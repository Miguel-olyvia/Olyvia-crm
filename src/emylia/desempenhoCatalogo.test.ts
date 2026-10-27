// 23/10/2026: o desempenho do Catálogo (desempenhoCatalogo.ts), com o estado de exemplo.
import { describe, expect, it } from "vitest";
import { seed } from "./motor";
import { desempenhoServicos, desempenhoTecnicos, desvio, desvioEmPalavras, ganho } from "./desempenhoCatalogo";

describe("o desempenho do Catálogo", () => {
  it("só contam como ganhos os contratos assinados (Financeiro ou Obra), sem perdidos", () => {
    const S = seed();
    const ds = desempenhoServicos(S);
    for (const x of ds.values()) { expect(x.ganhos).toBeLessThanOrEqual(x.orcamentos); if (!x.ganhos) expect(x.receita).toBe(0); }
    expect(S.deals.filter(ganho).every((d) => d.fase >= 4 && !d.perdido)).toBe(true);
  });
  it("os técnicos: validadas nunca passam das tarefas", () => {
    for (const t of desempenhoTecnicos(seed())) expect(t.validadas).toBeLessThanOrEqual(t.tarefas);
  });
  it("o desvio das horas em palavras", () => {
    expect(desvioEmPalavras(desvio(10, 10.3))).toBe("no previsto");
    expect(desvioEmPalavras(desvio(10, 12))).toBe("+20% de horas");
    expect(desvioEmPalavras(desvio(10, 8))).toBe("−20% de horas");
    expect(desvioEmPalavras(desvio(0, 3))).toBe("sem registos");
  });
});
