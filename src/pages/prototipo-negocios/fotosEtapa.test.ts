import { describe, expect, it } from "vitest";
import { acoes, fotosPor, seed } from "./motor";

describe("fotografias por etapa da visita", () => {
  it("os negócios de exemplo repartem o total sem o mudar", () => {
    const S = seed();
    for (const d of S.deals) {
      const p = fotosPor(d.visita);
      expect(p.exterior + p.interior + p.area).toBe(d.visita.fotos);
    }
    expect(fotosPor(S.deals.find((d) => d.id === 1050)!.visita)).toEqual({ exterior: 3, interior: 3, area: 3 });
  });
  it("tirar uma foto numa etapa sobe essa etapa e o total", () => {
    const S = seed();
    const A = acoes(S, () => {}, (fn) => fn());
    const d = S.deals.find((x) => x.id === 1035)!; // 6 fotos: 2 + 2 + 2
    A.foto(d.id, "exterior");
    expect(d.visita.fotosPor).toEqual({ exterior: 3, interior: 2, area: 2 });
    expect(d.visita.fotos).toBe(7);
    A.foto(d.id);
    expect(fotosPor(d.visita).area).toBe(3);
  });
});

describe("pontos de água fria e quente", () => {
  it("negócios de antes: fria = pontos de água, quente = 0; mudar uma refaz o total que os serviços usam", async () => {
    const { camposMedida, LINHAS, medida, medidaEmFalta, porMedida } = await import("./motor");
    expect(camposMedida(LINHAS.wc).map(([k]) => k)).toEqual(["pav", "par", "ptf", "ptq", "pcs"]);
    const m = { pav: 4, par: 14, pts: 3, pcs: 3 } as Parameters<typeof medida>[0];
    expect([medida(m, "ptf"), medida(m, "ptq")]).toEqual([3, 0]);
    expect(medidaEmFalta(m, "ptq")).toBe(false);
    porMedida(m, "ptq", 2);
    expect(m).toMatchObject({ ptf: 3, ptq: 2, pts: 5 });
    porMedida(m, "ptf", 0);
    expect(m.pts).toBe(2);
    expect(medidaEmFalta(m, "ptf")).toBe(false); // há pontos de água (quentes)
    porMedida(m, "ptq", 0);
    expect(medidaEmFalta(m, "ptf")).toBe(true);
  });
});
