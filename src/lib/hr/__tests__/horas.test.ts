/**
 * As horas contratadas e a unidade em que se comparam.
 *
 * O teste que importa mais e o ultimo: "40 mensais" e uma linha perfeitamente
 * legal para a base -- 9,2h por semana -- e e quase sempre um erro de unidade.
 * Nenhum CHECK o pode distinguir de um contrato real de 9h/semana, porque as
 * duas linhas sao identicas. Por isso avisa-se, e nao se bloqueia.
 */
import { describe, expect, it } from "vitest";
import {
  equivalenteParaMostrar,
  equivalenteSemanal,
  FACTOR_SEMANAL,
  horasAcimaDoTecto,
  horasImplausiveis,
  maximoDaFrequencia,
} from "@/lib/hr/horas";

describe("horas de trabalho em unidade canonica", () => {
  it("converte cada frequencia para horas por semana", () => {
    expect(equivalenteSemanal(8, "diaria")).toBe(40);
    expect(equivalenteSemanal(40, "semanal")).toBe(40);
    // 3/13 = 12/52: doze meses em cinquenta e duas semanas.
    expect(equivalenteSemanal(173.33, "mensal")).toBeCloseTo(40, 1);
    expect(equivalenteSemanal(2080, "anual")).toBe(40);
  });

  it("ausencia de horas nao e um contrato de zero horas", () => {
    expect(equivalenteSemanal(null, "semanal")).toBeNull();
    expect(equivalenteParaMostrar(null, "semanal")).toBeNull();
  });

  it("os quatro contratos de 40h/semana passam todos o tecto", () => {
    expect(horasAcimaDoTecto(8, "diaria")).toBe(false);
    expect(horasAcimaDoTecto(40, "semanal")).toBe(false);
    expect(horasAcimaDoTecto(173, "mensal")).toBe(false);
    expect(horasAcimaDoTecto(2080, "anual")).toBe(false);
  });

  it("o tecto de 80h/semana e o mesmo em qualquer unidade", () => {
    // Os limites por unidade nao estao escritos em sitio nenhum: saem do
    // factor. Se algum dia divergirem do CHECK da base, e aqui que se ve.
    expect(maximoDaFrequencia("diaria")).toBe(16);
    expect(maximoDaFrequencia("semanal")).toBe(80);
    expect(maximoDaFrequencia("mensal")).toBeCloseTo(346.67, 2);
    expect(maximoDaFrequencia("anual")).toBe(4160);

    expect(horasAcimaDoTecto(17, "diaria")).toBe(true);
    expect(horasAcimaDoTecto(81, "semanal")).toBe(true);
    expect(horasAcimaDoTecto(4161, "anual")).toBe(true);
  });

  it("2080 e legal por ano e ilegal por semana -- e era isso que o limite cru nao sabia", () => {
    expect(horasAcimaDoTecto(2080, "anual")).toBe(false);
    expect(horasAcimaDoTecto(2080, "semanal")).toBe(true);
  });

  it("avisa da unidade trocada sem recusar o contrato pequeno legitimo", () => {
    // 40 por mes: legal, e quase sempre "40 por semana" mal escolhido.
    expect(horasImplausiveis(40, "mensal")).toBe(true);
    // 40 por semana e 20 por semana: nenhum e suspeito.
    expect(horasImplausiveis(40, "semanal")).toBe(false);
    expect(horasImplausiveis(20, "semanal")).toBe(false);
    // Um contrato genuino de 9h/semana TAMBEM avisa. E o preco assumido: nao
    // ha como distingui-lo de "40 mensais", porque a linha e a mesma.
    expect(horasImplausiveis(9, "semanal")).toBe(true);
    // Acima do tecto nao e "aviso": e erro, e trata-se noutro sitio.
    expect(horasImplausiveis(100, "semanal")).toBe(false);
  });

  it("os factores sao os mesmos que a coluna gerada da base usa", () => {
    // Se estes numeros mudarem sem a migration mudar, o ecra passa a validar
    // contra um limite que a base nao tem.
    expect(FACTOR_SEMANAL.diaria).toBe(5);
    expect(FACTOR_SEMANAL.semanal).toBe(1);
    expect(FACTOR_SEMANAL.mensal).toBe(3 / 13);
    expect(FACTOR_SEMANAL.anual).toBe(1 / 52);
  });
});
