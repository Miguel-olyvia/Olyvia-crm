import { describe, expect, it } from "vitest";
import { oQueFaltaAgora, percursoDaOrdem } from "../percurso";
import { ESTADOS } from "../tipos";

/**
 * O que aqui se prova: que a régua tem sempre o mesmo tamanho, que a marca cai
 * no degrau certo em cada estado, e que uma ordem pausada não desaparece do
 * caminho.
 */

const situacoes = (estado: Parameters<typeof percursoDaOrdem>[0]) =>
  percursoDaOrdem(estado).map((d) => d.situacao);

describe("a régua", () => {
  it("tem sempre cinco degraus, seja qual for o estado", () => {
    for (const e of ESTADOS) {
      expect(percursoDaOrdem(e)).toHaveLength(5);
    }
  });

  it("nunca tem mais do que um degrau atual", () => {
    for (const e of ESTADOS) {
      expect(situacoes(e).filter((s) => s === "atual").length).toBeLessThanOrEqual(1);
    }
  });

  it("cada degrau diz o que falta para o seguinte", () => {
    expect(percursoDaOrdem("agendada").every((d) => d.oQueFalta.length > 0)).toBe(true);
  });
});

describe("onde cai a marca", () => {
  it("numa ordem por aprovar, está no princípio", () => {
    expect(situacoes("por_aprovar")).toEqual(["atual", "futuro", "futuro", "futuro", "futuro"]);
  });

  it("numa em curso, deixa dois degraus para trás", () => {
    expect(situacoes("em_curso")).toEqual(["feito", "feito", "atual", "futuro", "futuro"]);
  });

  it("numa confirmada, está tudo feito e a marca no fim", () => {
    expect(situacoes("confirmada")).toEqual(["feito", "feito", "feito", "feito", "atual"]);
  });
});

describe("os casos que não são o caminho normal", () => {
  /*
   * Uma ordem em pausa continua a estar em curso — o que parou foi o relógio,
   * não o trabalho. Pô-la fora da régua daria a entender que recuou.
   */
  it("uma pausada mostra-se no mesmo degrau que uma em curso", () => {
    expect(situacoes("pausada")).toEqual(situacoes("em_curso"));
  });

  it("mas diz que está em pausa, e o que falta é retomar", () => {
    expect(oQueFaltaAgora("pausada")).toMatch(/retomar/i);
  });

  it("uma cancelada não tem degrau atual — o caminho acabou antes do fim", () => {
    const s = situacoes("cancelada");
    expect(s).not.toContain("atual");
    expect(s.filter((x) => x === "desviado")).toHaveLength(4);
  });
});

describe("o que falta agora", () => {
  it("numa fechada, é a confirmação — que é onde as ordens ficam paradas", () => {
    expect(oQueFaltaAgora("fechada")).toMatch(/confirmar/i);
  });

  it("numa confirmada, não falta nada", () => {
    expect(oQueFaltaAgora("confirmada")).toBeNull();
  });

  it("e há sempre uma frase para dizer, exceto no fim", () => {
    for (const e of ESTADOS) {
      if (e === "confirmada") continue;
      expect(oQueFaltaAgora(e)).toBeTruthy();
    }
  });
});
