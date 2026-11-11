// As datas da pessoa derivadas dos contratos (20270114100000): o trigger e os CHECKs dizem-se numa frase, nunca em bruto.
import { beforeEach, describe, expect, it } from "vitest";
import { mapFriendlyErrorText } from "./friendlyError";
import { tabelaFundida } from "@/translations/tabelaFundida";

beforeEach(() => window.localStorage.setItem("language", "pt"));

describe("mapFriendlyErrorText: erros das datas da pessoa e do contrato", () => {
  it.each([
    ["pessoas_datas_derivadas: a data de contratacao, a de antiguidade e a de saida derivam dos contratos", "hr.erro.datas.calculadas"],
    ["pessoas_datas_derivadas: pessoas.data_saida nao se preenche ao criar a pessoa", "hr.erro.datas.calculadas"],
    ['violates check constraint "pessoas_vinculos_antiguidade_ate_inicio"', "hr.erro.datas.antiguidadeDepoisInicio"],
    ['violates check constraint "pessoas_saida_depois_admissao"', "hr.erro.datas.saidaAntesContratacao"],
    ['violates check constraint "pessoas_vinculos_fim_depois_inicio"', "hr.erro.datas.fimAntesInicio"],
  ])("%s", (cru, chave) => {
    expect(mapFriendlyErrorText(cru)).toBe(tabelaFundida.pt[chave]);
  });

  it("em ingles quando a lingua e o ingles", () => {
    window.localStorage.setItem("language", "en");
    expect(mapFriendlyErrorText('violates check constraint "pessoas_saida_depois_admissao"')).toBe(
      tabelaFundida.en["hr.erro.datas.saidaAntesContratacao"],
    );
  });

  it("um erro que nao e das datas fica como veio", () => {
    expect(mapFriendlyErrorText('violates check constraint "pessoas_vinculos_horas_periodo_nao_negativa"')).toBe(
      'violates check constraint "pessoas_vinculos_horas_periodo_nao_negativa"',
    );
  });
});
