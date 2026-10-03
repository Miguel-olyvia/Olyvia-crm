import { describe, expect, it } from "vitest";
import {
  aprenderRitmo,
  chaveDosFatores,
  descreverFatores,
  fatoresDoLocal,
  formatarEspera,
  medidasDaArea,
  minutoDepoisDaEspera,
  rotuloOrigem,
} from "../planeamento";

describe("medidasDaArea", () => {
  it("calcula a parede pelo perímetro e a altura do revestimento", () => {
    const m = medidasDaArea(
      { diag_m2_pavimento: 5, diag_perimetro_m: 9, diag_altura_revestimento: "teto", diag_pe_direito_m: 2.5, diag_pontos_agua: 4 },
      { m2_pavimento: 4, m2_parede: 18, pecas_sanitarias: 4 }
    );
    expect(m).toMatchObject({ m2_pavimento: 5, m2_parede: 22.5, m2_total: 27.5, pontos_agua: 4, pecas_sanitarias: 4 });
  });

  it("sem área, usa a referência do pacote × a quantidade", () => {
    expect(medidasDaArea(null, { m2_pavimento: 4, m2_parede: 18 }, 2)).toMatchObject({ m2_pavimento: 8, m2_parede: 36, m2_total: 44 });
  });

  it("a área em m² vale como pavimento; 60 cm de revestimento", () => {
    const m = medidasDaArea({ diag_area_m2: "6,5", diag_perimetro_m: 10, diag_altura_revestimento: "60cm" }, {});
    expect(m).toMatchObject({ m2_pavimento: 6.5, m2_parede: 6, m2_total: 12.5 });
  });
});

describe("fatores", () => {
  it("lê a ficha do local e a área com valores fechados", () => {
    const f = fatoresDoLocal({ diag_janela: false, diag_local_cortes: "fora", diag_altura_revestimento: "teto" },
      { habitada_durante_obra: true, acesso: "dificil", tem_elevador: false, piso: 3, mobilada: "outra coisa" });
    expect(f).toEqual({ habitada: "sim", acesso: "dificil", elevador: "nao", andar: "3+", janela: "nao",
                        local_cortes: "fora", altura_revestimento: "teto" });
    expect(chaveDosFatores(f, ["local_cortes", "janela", "altura_revestimento", "mobilada"]))
      .toBe("altura_revestimento=teto|janela=nao|local_cortes=fora");
    expect(descreverFatores("habitada=sim|local_cortes=fora")).toBe("casa habitada: sim · cortes: fora");
  });

  it("o rés-do-chão e o 1.º andar agrupam-se", () => {
    expect(fatoresDoLocal(null, { piso: 0 }).andar).toBe("rc");
    expect(fatoresDoLocal(null, { piso: 2 }).andar).toBe("1-2");
  });
});

describe("minutoDepoisDaEspera (igual ao SQL)", () => {
  const dias = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10"];
  const H8 = 8 * 60;
  it("sem espera, começa logo", () => expect(minutoDepoisDaEspera(dias, H8, 480, 480, 0)).toBe(480));
  it("sexta ao fim do dia + 48 h → segunda de manhã", () => expect(minutoDepoisDaEspera(dias, H8, 480, 5 * 480, 48)).toBe(5 * 480));
  it("a meio do dia + 24 h → no dia seguinte à mesma hora", () => expect(minutoDepoisDaEspera(dias, H8, 480, 240, 24)).toBe(720));
  it("acaba de madrugada → de manhã", () => expect(minutoDepoisDaEspera(dias, H8, 480, 480, 12)).toBe(480));
});

describe("aprenderRitmo (igual ao SQL)", () => {
  it("com 1 obra mexe pouco: 60 → 63,8 min/m²", () => {
    expect(aprenderRitmo({ fixos: 120, porUnidade: 60 }, "m2_total", [2000], [25]))
      .toEqual({ minutos_fixos: 120, minutos_por_unidade: 63.8, n: 1 });
  });
  it("só fixo: a média puxada para o padrão", () => {
    expect(aprenderRitmo({ fixos: 120, porUnidade: 0 }, "fixo", [200, 160], [0, 0]))
      .toEqual({ minutos_fixos: 144, minutos_por_unidade: 0, n: 2 });
  });
  it("tira os absurdos e ignora tarefas de minutos", () => {
    const r = aprenderRitmo({ fixos: 0, porUnidade: 60 }, "m2_total", [600, 620, 640, 6000, 3], [10, 10, 10, 10, 10]);
    expect(r.n).toBe(3);
    expect(r.minutos_por_unidade).toBe(61);
  });
  it("com 5+ de tamanhos diferentes separa o fixo do variável", () => {
    const qts = [5, 10, 15, 20, 25];
    const reais = qts.map((q) => 300 + 50 * q);
    const r = aprenderRitmo({ fixos: 120, porUnidade: 60 }, "m2_total", reais, qts);
    expect(r.n).toBe(5);
    expect(r.minutos_fixos).toBeCloseTo((3 * 120 + 5 * 300) / 8, 2);
    expect(r.minutos_por_unidade).toBeCloseTo((3 * 60 + 5 * 50) / 8, 3);
  });
});

describe("rótulos", () => {
  it("esperas", () => {
    expect(formatarEspera(0)).toBe("");
    expect(formatarEspera(24)).toBe("24 h");
    expect(formatarEspera(48)).toBe("48 h");
    expect(formatarEspera(120)).toBe("5 dias");
    expect(formatarEspera(60)).toBe("2 dias e 12 h");
  });
  it("origem do tempo", () => {
    expect(rotuloOrigem("aprendido", 12)).toBe("aprendido (12 tarefas)");
    expect(rotuloOrigem("padrao")).toBe("padrão");
    expect(rotuloOrigem(null)).toBe("");
  });
});
