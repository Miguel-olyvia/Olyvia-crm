/**
 * A sugestao de periodo experimental e SO uma sugestao: estes testes fixam os
 * numeros do diploma por categoria e tipo de contrato, e fixam sobretudo os
 * casos em que a funcao se recusa a inventar -- `prestacao_servicos`,
 * `tempo_parcial`, `duracao_muito_curta`, e termo sem data de fim.
 */
import { describe, expect, it } from "vitest";
import { sugerirPeriodoExperimentalDias } from "@/lib/hr/periodoExperimental";

describe("sugerirPeriodoExperimentalDias — sem termo", () => {
  it("90 dias para categoria geral", () => {
    expect(
      sugerirPeriodoExperimentalDias({ tipoContrato: "sem_termo", categoriaFuncao: "geral" }),
    ).toEqual({ dias: 90, motivoKey: "hr.periodoExperimental.motivoSemTermo" });
  });

  it("180 dias para tecnica ou de confianca", () => {
    expect(
      sugerirPeriodoExperimentalDias({
        tipoContrato: "sem_termo",
        categoriaFuncao: "tecnica_confianca",
      })?.dias,
    ).toBe(180);
  });

  it("240 dias para direccao ou quadro superior", () => {
    expect(
      sugerirPeriodoExperimentalDias({
        tipoContrato: "sem_termo",
        categoriaFuncao: "direcao_quadro_superior",
      })?.dias,
    ).toBe(240);
  });
});

describe("sugerirPeriodoExperimentalDias — termo certo e temporario", () => {
  it("30 dias quando a duracao chega aos 6 meses", () => {
    const sugestao = sugerirPeriodoExperimentalDias({
      tipoContrato: "termo_certo",
      categoriaFuncao: "geral",
      dataInicio: "2026-01-01",
      dataFim: "2026-07-05",
    });
    expect(sugestao).toEqual({ dias: 30, motivoKey: "hr.periodoExperimental.motivoTermoLongo" });
  });

  it("15 dias quando a duracao fica abaixo de 6 meses", () => {
    const sugestao = sugerirPeriodoExperimentalDias({
      tipoContrato: "termo_certo",
      categoriaFuncao: "geral",
      dataInicio: "2026-01-01",
      dataFim: "2026-03-01",
    });
    expect(sugestao).toEqual({ dias: 15, motivoKey: "hr.periodoExperimental.motivoTermoCurto" });
  });

  it("temporario segue a mesma regra que termo certo", () => {
    expect(
      sugerirPeriodoExperimentalDias({
        tipoContrato: "temporario",
        categoriaFuncao: "geral",
        dataInicio: "2026-01-01",
        dataFim: "2026-07-05",
      })?.dias,
    ).toBe(30);
  });

  it("nao sugere nada sem as duas datas -- nao ha como saber se chega aos 6 meses", () => {
    expect(
      sugerirPeriodoExperimentalDias({
        tipoContrato: "termo_certo",
        categoriaFuncao: "geral",
        dataInicio: "2026-01-01",
        dataFim: null,
      }),
    ).toBeNull();
    expect(
      sugerirPeriodoExperimentalDias({ tipoContrato: "termo_certo", categoriaFuncao: "geral" }),
    ).toBeNull();
  });
});

describe("sugerirPeriodoExperimentalDias — os outros tipos", () => {
  it("termo incerto: 30 dias, sem depender da categoria", () => {
    expect(
      sugerirPeriodoExperimentalDias({
        tipoContrato: "termo_incerto",
        categoriaFuncao: "direcao_quadro_superior",
      })?.dias,
    ).toBe(30);
  });

  it("estagio: 30 dias", () => {
    expect(
      sugerirPeriodoExperimentalDias({ tipoContrato: "estagio", categoriaFuncao: "geral" })?.dias,
    ).toBe(30);
  });

  it("prestacao de servicos: sem periodo experimental, devolve null", () => {
    expect(
      sugerirPeriodoExperimentalDias({
        tipoContrato: "prestacao_servicos",
        categoriaFuncao: "geral",
      }),
    ).toBeNull();
  });

  it("tempo parcial e duracao muito curta: sem categoria legal, devolve null", () => {
    expect(
      sugerirPeriodoExperimentalDias({ tipoContrato: "tempo_parcial", categoriaFuncao: "geral" }),
    ).toBeNull();
    expect(
      sugerirPeriodoExperimentalDias({
        tipoContrato: "duracao_muito_curta",
        categoriaFuncao: "geral",
      }),
    ).toBeNull();
  });
});
