/**
 * `resumoCodigoProcessamento`: funcao pura que traduz um codigo de
 * processamento para uma frase em linguagem de negocio (usada na lista de
 * `ConfiguracaoVencimento.tsx`). So testa a logica de escolha de chave e
 * formatacao -- a traducao em si e um `t` simulado que devolve a chave com
 * os parametros interpolados, para o teste nao depender do texto real.
 */
import { describe, it, expect } from "vitest";
import { resumoCodigoProcessamento } from "@/lib/hr/resumoCodigoProcessamento";

function tSimulado(key: string, params?: Record<string, string | number>): string {
  if (!params) return key;
  return `${key}(${Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(",")})`;
}

describe("resumoCodigoProcessamento", () => {
  it("manual -- so a chave, sem parametros", () => {
    expect(
      resumoCodigoProcessamento(
        { modo_calculo: "manual", percentagem: null, valor_fixo: null, origem_automatica: null },
        tSimulado,
      ),
    ).toBe("hr.vencimento.codigos.resumo.manual");
  });

  it("percentagem_hora_normal sem origem -- so a percentagem", () => {
    expect(
      resumoCodigoProcessamento(
        {
          modo_calculo: "percentagem_hora_normal",
          percentagem: 150,
          valor_fixo: null,
          origem_automatica: null,
        },
        tSimulado,
      ),
    ).toBe("hr.vencimento.codigos.resumo.percentagem(percentagem=150)");
  });

  it("percentagem_hora_normal com origem -- percentagem seguida da origem", () => {
    expect(
      resumoCodigoProcessamento(
        {
          modo_calculo: "percentagem_hora_normal",
          percentagem: 150,
          valor_fixo: null,
          origem_automatica: "horas_extra",
        },
        tSimulado,
      ),
    ).toBe(
      "hr.vencimento.codigos.resumo.percentagem(percentagem=150) · hr.vencimento.codigos.origem.horas_extra",
    );
  });

  it("valor_fixo_ocorrencia com origem feriado_trabalhado -- chave especifica de feriado", () => {
    expect(
      resumoCodigoProcessamento(
        {
          modo_calculo: "valor_fixo_ocorrencia",
          percentagem: null,
          valor_fixo: 12.5,
          origem_automatica: "feriado_trabalhado",
        },
        tSimulado,
      ),
    ).toBe("hr.vencimento.codigos.resumo.valorFixoFeriado(valor=12,50 €)");
  });

  it("valor_fixo_ocorrencia com origem descanso_trabalhado -- chave especifica de descanso", () => {
    expect(
      resumoCodigoProcessamento(
        {
          modo_calculo: "valor_fixo_ocorrencia",
          percentagem: null,
          valor_fixo: 12.5,
          origem_automatica: "descanso_trabalhado",
        },
        tSimulado,
      ),
    ).toBe("hr.vencimento.codigos.resumo.valorFixoDescanso(valor=12,50 €)");
  });

  it("valor_fixo_ocorrencia sem origem -- chave generica de ocorrencia", () => {
    expect(
      resumoCodigoProcessamento(
        {
          modo_calculo: "valor_fixo_ocorrencia",
          percentagem: null,
          valor_fixo: 12.5,
          origem_automatica: null,
        },
        tSimulado,
      ),
    ).toBe("hr.vencimento.codigos.resumo.valorFixoOcorrencia(valor=12,50 €)");
  });

  it("valor_fixo_mensal -- valor por mes", () => {
    expect(
      resumoCodigoProcessamento(
        { modo_calculo: "valor_fixo_mensal", percentagem: null, valor_fixo: 50, origem_automatica: null },
        tSimulado,
      ),
    ).toBe("hr.vencimento.codigos.resumo.valorFixoMensal(valor=50,00 €)");
  });
});
