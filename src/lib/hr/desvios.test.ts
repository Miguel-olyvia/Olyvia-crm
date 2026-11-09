import { describe, expect, it } from "vitest";
import casosJson from "@/lib/hr/__fixtures__/desvios-casos.json";
import {
  classificarDia,
  intervalosEsperados,
  medirDia,
  minutosQueContam,
} from "@/lib/hr/desvios";
import type { Periodo } from "@/lib/hr/assiduidade";

interface Caso {
  nome: string;
  planeado: string[];
  realizado: string[];
  margemMin: number;
  medidas: Record<string, number> | null;
  classificacao: Record<string, unknown>;
}

function paraPeriodos(intervalos: readonly string[]): Periodo[] {
  return intervalos.map((i) => {
    const [hora_inicio, hora_fim] = i.split("-");
    return { hora_inicio, hora_fim };
  });
}

const casos = casosJson.casos as unknown as Caso[];

describe("casos partilhados com a base (desvios-casos.json)", () => {
  it("tem os casos obrigatorios", () => {
    expect(casos.length).toBeGreaterThanOrEqual(10);
  });

  for (const caso of casos) {
    it(`medirDia e classificarDia: ${caso.nome}`, () => {
      const medidas = medirDia(paraPeriodos(caso.planeado), paraPeriodos(caso.realizado));
      expect(medidas).toEqual(caso.medidas);
      expect(classificarDia(medidas, caso.margemMin)).toEqual(caso.classificacao);
    });
  }
});

describe("propriedades de medirDia", () => {
  for (const caso of casos) {
    if (!caso.medidas) continue;
    it(`diferenca = realizado - planeado; fora e emFalta nao negativos: ${caso.nome}`, () => {
      const m = medirDia(paraPeriodos(caso.planeado), paraPeriodos(caso.realizado));
      expect(m).not.toBeNull();
      if (!m) return;
      expect(m.diferencaMin).toBe(m.realizadoMin - m.planeadoMin);
      expect(m.foraMin).toBeGreaterThanOrEqual(0);
      expect(m.emFaltaMin).toBeGreaterThanOrEqual(0);
      expect(m.desvioHorarioMin).toBe(Math.min(m.foraMin, m.emFaltaMin));
    });
  }

  it("sobreposicoes nos intervalos nao contam duas vezes", () => {
    const m = medirDia(
      [{ hora_inicio: "09:00", hora_fim: "18:00" }],
      [
        { hora_inicio: "09:00", hora_fim: "13:00" },
        { hora_inicio: "12:00", hora_fim: "18:00" },
      ],
    );
    expect(m?.realizadoMin).toBe(540);
    expect(m?.foraMin).toBe(0);
    expect(m?.emFaltaMin).toBe(0);
  });
});

describe("classificarDia", () => {
  it("sem medidas nao ha desvio", () => {
    expect(classificarDia(null, 0)).toEqual({
      temDesvioTempo: false,
      temDesvioHorario: false,
      natureza: null,
    });
  });
});

describe("intervalosEsperados", () => {
  const planeado: Periodo[] = [{ hora_inicio: "09:00", hora_fim: "18:00" }];

  it("padrao usa o planeado como janelas", () => {
    expect(intervalosEsperados(planeado, "padrao")).toEqual({
      modo: "padrao",
      janelas: planeado,
      motivo: null,
    });
  });

  it("isencao de horario nao gera desvios", () => {
    const r = intervalosEsperados(planeado, "isencao_horario");
    expect(r.modo).toBe("sem_desvios");
    expect(r.janelas).toEqual([]);
    expect(r.motivo).toBeTruthy();
  });

  it("tipo sem regra fica nao_definido e diz o motivo", () => {
    const r = intervalosEsperados(planeado, "repartido");
    expect(r.modo).toBe("nao_definido");
    expect(r.janelas).toEqual([]);
    expect(r.motivo).toBeTruthy();
  });
});

describe("minutosQueContam", () => {
  const dia = { planeadoMin: 540, realizadoMin: 580, temDesvio: true };

  it("dentro da margem conta o planeado", () => {
    expect(minutosQueContam({ ...dia, temDesvio: false }, "hora_extra")).toEqual({
      contadoMin: 540,
      extraMin: 0,
    });
  });
  it("normal conta o planeado sem extra", () => {
    expect(minutosQueContam(dia, "normal")).toEqual({ contadoMin: 540, extraMin: 0 });
  });
  it("hora_extra conta o realizado e o excesso como extra", () => {
    expect(minutosQueContam(dia, "hora_extra")).toEqual({ contadoMin: 580, extraMin: 40 });
  });
  it("aceitar_desvio conta o realizado sem extra", () => {
    expect(minutosQueContam(dia, "aceitar_desvio")).toEqual({ contadoMin: 580, extraMin: 0 });
    expect(
      minutosQueContam({ planeadoMin: 540, realizadoMin: 515, temDesvio: true }, "aceitar_desvio"),
    ).toEqual({ contadoMin: 515, extraMin: 0 });
  });
  it("a_validar e sem decisao contam provisoriamente o planeado", () => {
    expect(minutosQueContam(dia, "a_validar")).toEqual({ contadoMin: 540, extraMin: 0 });
    expect(minutosQueContam(dia, null)).toEqual({ contadoMin: 540, extraMin: 0 });
  });
});
