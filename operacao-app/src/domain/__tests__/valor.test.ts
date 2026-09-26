import { describe, expect, it } from "vitest";
import {
  DIAS_UTEIS,
  PARTIDA,
  calcular,
  contaDaMaoDeObra,
  contaDoTrabalhoPerdido,
  type Entradas,
} from "../valor";

const e = (p: Partial<Entradas> = {}): Entradas => ({ ...PARTIDA, ...p });

describe("a mão de obra que hoje não está em lado nenhum", () => {
  it("é técnicos × horas × dias úteis × custo/hora", () => {
    const r = calcular(e({ tecnicos: 2, horasPorDia: 8, custoHora: 20 }));
    expect(r.horasPorAno).toBe(2 * 8 * DIAS_UTEIS);
    expect(r.maoDeObraPorAno).toBe(2 * 8 * DIAS_UTEIS * 20);
  });

  it("sem custo/hora dá zero — que é exatamente o que o Infraspeak mostra", () => {
    // O campo existe lá e nunca é preenchido. O resultado é 0,00 € em todas
    // as ordens, e é esse o ponto.
    expect(calcular(e({ custoHora: 0 })).maoDeObraPorAno).toBe(0);
  });

  it("sem técnicos não há horas", () => {
    expect(calcular(e({ tecnicos: 0 })).horasPorAno).toBe(0);
  });
});

describe("o trabalho encontrado que se perde", () => {
  it("é avarias × percentagem × 12 × valor", () => {
    const r = calcular(e({ avariasPorMes: 10, percentagemPerdida: 50, valorReparacao: 100 }));
    expect(r.avariasPerdidasPorAno).toBe(60);
    expect(r.trabalhoPerdidoPorAno).toBe(6000);
  });

  it("zero por cento perdidas dá zero", () => {
    expect(calcular(e({ percentagemPerdida: 0 })).trabalhoPerdidoPorAno).toBe(0);
  });

  it("acima de cem por cento é cem — não se perde mais do que se encontra", () => {
    const a = calcular(e({ percentagemPerdida: 100 }));
    const b = calcular(e({ percentagemPerdida: 250 }));
    expect(b.avariasPerdidasPorAno).toBe(a.avariasPerdidasPorAno);
  });
});

describe("números que alguém escreve com o dedo", () => {
  it("um campo vazio não dá NaN", () => {
    const r = calcular(e({ tecnicos: Number.NaN, custoHora: Number.NaN }));
    expect(r.horasPorAno).toBe(0);
    expect(r.maoDeObraPorAno).toBe(0);
  });

  it("um menos escrito por engano não dá um valor negativo", () => {
    const r = calcular(e({ tecnicos: -6, valorReparacao: -120 }));
    expect(r.horasPorAno).toBe(0);
    expect(r.trabalhoPerdidoPorAno).toBe(0);
  });

  it("infinito não passa", () => {
    expect(calcular(e({ custoHora: Number.POSITIVE_INFINITY })).maoDeObraPorAno).toBe(0);
  });

  it("tudo a zero dá tudo a zero, sem rebentar", () => {
    const r = calcular({
      tecnicos: 0,
      horasPorDia: 0,
      custoHora: 0,
      avariasPorMes: 0,
      percentagemPerdida: 0,
      valorReparacao: 0,
    });
    expect(r).toEqual({
      horasPorAno: 0,
      maoDeObraPorAno: 0,
      avariasPerdidasPorAno: 0,
      trabalhoPerdidoPorAno: 0,
    });
  });
});

describe("a conta escrita por extenso", () => {
  it("mostra as parcelas, para se poder discordar de uma", () => {
    const texto = contaDaMaoDeObra(e({ tecnicos: 6, horasPorDia: 8, custoHora: 18 }));
    expect(texto).toContain("6 técnicos");
    expect(texto).toContain("8 h");
    expect(texto).toContain(String(DIAS_UTEIS));
    expect(texto).toContain("18 €/h");
  });

  it("e o mesmo para o trabalho perdido", () => {
    const texto = contaDoTrabalhoPerdido(e({ avariasPorMes: 10, percentagemPerdida: 30 }));
    expect(texto).toContain("10 avarias/mês");
    expect(texto).toContain("30%");
    expect(texto).toContain("12 meses");
  });
});
