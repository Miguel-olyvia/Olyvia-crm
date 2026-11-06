import { describe, expect, it } from "vitest";
import { valorHoraDaFicha } from "./valorHora";
import { valorHoraDeExemplo } from "@/components/rh-exemplo/lib/faltasB";

const ficha = (retribuicao: { valor_base: number; periodicidade: string }) =>
  ({
    retribuicoes: [{ ...retribuicao, valido_ate: null }],
    horasVersoes: [{ valido_ate: null, horas_semanais_equivalentes: 40 }],
  }) as never;

describe("valorHoraDaFicha: o ordenado mensal equivalente de cada periodicidade", () => {
  it("mensal fica como esta", () => {
    expect(valorHoraDaFicha(ficha({ valor_base: 1300, periodicidade: "mensal" }))).toMatchObject({
      valorMensal: 1300,
      porOmissao: false,
    });
  });

  it("um cargo semanal de 300 por semana vale 300 x 52 / 12 = 1300 por mes (e nao cai no valor por omissao)", () => {
    const r = valorHoraDaFicha(ficha({ valor_base: 300, periodicidade: "semanal" }));
    expect(r).toMatchObject({ valorMensal: 1300, horasSemanais: 40, porOmissao: false });
    expect(r.valorHora).toBe(valorHoraDeExemplo(1300, 40));
  });

  it("uma periodicidade que nao se converte aqui (a hora) usa o valor por omissao do documento", () => {
    expect(valorHoraDaFicha(ficha({ valor_base: 5.4, periodicidade: "hora" }))).toMatchObject({
      valorHora: 6.25,
      porOmissao: true,
    });
  });
});