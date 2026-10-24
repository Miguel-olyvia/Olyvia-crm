import { describe, expect, it } from "vitest";
import { catalogo0 } from "./v2/catalogoModelo";
import { equipamentosDosServicos } from "./equipamentosCliente";

describe("produtos do Catálogo por serviço (para o orçamento)", () => {
  it("louças e móveis dão os produtos do seu ramo, sem os consumíveis das receitas", () => {
    const g = equipamentosDosServicos(catalogo0(), ["demol", "loucas", "moveis"]);
    expect(g.map((x) => x.sid)).toEqual(["loucas", "moveis"]);
    const loucas = g[0].produtos.map((p) => p.n);
    expect(loucas).toEqual(expect.arrayContaining(["Sanita suspensa com estrutura", "Sanita compacta", "Base de duche 80×120", "Banheira acrílica 170×70"]));
    expect(loucas.some((n) => /silicone|fita|saco/i.test(n))).toBe(false);
    expect(g[1].produtos.map((p) => p.n)).toEqual(expect.arrayContaining(["Bancada em pedra", "Bancada laminada"]));
  });
});
