// 23/10/2026: o relógio real das obras na 2.0 (motor: diaReal). Dias úteis desde o início; depois do fim, o atraso.
import { describe, expect, it } from "vitest";
import { diaReal, type Plano } from "./motor";

// um plano do orçamento, em curso, com 5 dias de trabalho a começar na segunda 12/10/2026
const plano = (x: Partial<Plano> = {}): Plano => ({
  estado: "em curso", origem: "orcamento", inicio: "2026-10-12", dia: 0,
  tasks: [{ dia: 0, dur: 2 }, { dia: 2, dur: 3 }],
  ...x,
} as unknown as Plano);
const dia = (iso: string) => { const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d, 15, 30); };

describe("o relógio real da obra", () => {
  it("dentro do prazo: o dia útil de hoje desde o início", () => {
    expect(diaReal(plano(), dia("2026-10-12"))).toEqual({ dia: 0, atraso: 0 });
    expect(diaReal(plano(), dia("2026-10-14"))).toEqual({ dia: 2, atraso: 0 });
    expect(diaReal(plano(), dia("2026-10-16"))).toEqual({ dia: 4, atraso: 0 });
  });
  it("o fim de semana não conta (sábado e domingo ficam no dia de sexta)", () => {
    expect(diaReal(plano({ inicio: "2026-10-16" }), dia("2026-10-18"))).toEqual({ dia: 0, atraso: 0 });
    expect(diaReal(plano({ inicio: "2026-10-16" }), dia("2026-10-19"))).toEqual({ dia: 1, atraso: 0 });
  });
  it("depois do fim previsto: fica no último dia e diz quantos dias úteis vai atrasada", () => {
    // 5 dias de 12 a 16/10; 23/10 (sexta) é o 10.º dia útil → 5 dias úteis de atraso
    expect(diaReal(plano(), dia("2026-10-23"))).toEqual({ dia: 4, atraso: 5 });
  });
  it("antes do início: o 1.º dia", () => {
    expect(diaReal(plano(), dia("2026-10-10"))).toEqual({ dia: 0, atraso: 0 });
  });
  it("só planos do orçamento em curso e com data de início", () => {
    expect(diaReal(plano({ estado: "por aprovar" } as Partial<Plano>), dia("2026-10-15"))).toBeNull();
    expect(diaReal(plano({ origem: undefined }), dia("2026-10-15"))).toBeNull();
    expect(diaReal(plano({ inicio: undefined }), dia("2026-10-15"))).toBeNull();
  });
});
