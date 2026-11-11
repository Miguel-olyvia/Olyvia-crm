/**
 * Admissao sem contrato nem cargo: o contrato e opcional. Estas funcoes dizem se o formulario "Nova pessoa" tem ALGUM campo do
 * contrato preenchido (e ai tipo e data de inicio passam a obrigatorios juntos), e se ha retribuicao a definir (so com cargo E
 * contrato: o salario base vem do cargo, e a retribuicao pendura no vinculo).
 */
import { describe, expect, it } from "vitest";
import { comPatch, valoresIniciais, type ValoresNovaPessoa } from "@/components/rh-exemplo/novaPessoa/tiposNova";
import { contratoCompleto, contratoPreenchido, retribuicaoADefinir } from "./novaPessoaContrato";

describe("contratoPreenchido", () => {
  it("o formulario que acabou de abrir nao tem contrato (nem data de inicio por omissao)", () => {
    const v = valoresIniciais();
    expect(v.contrato.data_inicio).toBe("");
    expect(contratoPreenchido(v)).toBe(false);
  });

  it("os valores por omissao (regime, regime contratual, feriados) nao contam como contrato preenchido", () => {
    const v = valoresIniciais();
    expect(v.contrato.regime).toBe("tempo_inteiro");
    expect(contratoPreenchido(v)).toBe(false);
  });

  it("o cargo e o local nao sao campos do contrato", () => {
    const v = comPatch(valoresIniciais(), "laborais", { cargo_id: "cargo-1", local_id: "local-1", reporta_a_pessoa_id: "p1" });
    expect(contratoPreenchido(v)).toBe(false);
  });

  const casos: Array<[string, (v: ValoresNovaPessoa) => ValoresNovaPessoa]> = [
    ["tipo de contrato", (v) => comPatch(v, "contrato", { tipo_contrato: "sem_termo" })],
    ["data de inicio", (v) => comPatch(v, "contrato", { data_inicio: "2026-10-01" })],
    ["antiguidade", (v) => comPatch(v, "contrato", { data_antiguidade: "2020-01-01" })],
    ["data de fim", (v) => comPatch(v, "contrato", { data_fim: "2027-01-01" })],
    ["periodo experimental ligado", (v) => comPatch(v, "contrato", { tem_periodo_experimental: true })],
    ["dias de periodo experimental", (v) => comPatch(v, "contrato", { periodo_experimental_dias: "90" })],
    ["tipo de trabalho", (v) => comPatch(v, "contrato", { tipo_trabalho: "presencial" })],
    ["horas de trabalho", (v) => comPatch(v, "contrato", { horas_trabalho: "40" })],
    ["dias uteis", (v) => comPatch(v, "contrato", { dias_uteis: ["seg"] })],
    ["horario variavel", (v) => comPatch(v, "contrato", { horario_variavel: true })],
    ["regime diferente do de omissao", (v) => comPatch(v, "contrato", { regime: "tempo_parcial" })],
    ["regime contratual diferente do de omissao", (v) => comPatch(v, "contrato", { regime_contratual: "coletivo" })],
    ["politica de feriados diferente da de omissao", (v) => comPatch(v, "contrato", { politica_feriados: "trabalho_habitual" })],
    ["categoria da funcao", (v) => comPatch(v, "extra", { categoria_funcao: "geral" })],
    ["categoria profissional", (v) => comPatch(v, "extra", { categoria_profissional: "Tecnico" })],
    ["renovavel", (v) => comPatch(v, "extra", { renovavel: "sim" })],
    ["isencao de horario", (v) => comPatch(v, "extra", { isencao_horario: true })],
  ];
  it.each(casos)("qualquer campo do contrato basta: %s", (_nome, preencher) => {
    expect(contratoPreenchido(preencher(valoresIniciais()))).toBe(true);
  });

  it("espacos em branco nao contam como preenchido", () => {
    const v = comPatch(valoresIniciais(), "contrato", { data_inicio: "   ", horas_trabalho: " " });
    expect(contratoPreenchido(v)).toBe(false);
  });
});

describe("retribuicaoADefinir", () => {
  const comCargo = (v: ValoresNovaPessoa) => comPatch(v, "laborais", { cargo_id: "cargo-1" });
  const comContrato = (v: ValoresNovaPessoa) => comPatch(v, "contrato", { tipo_contrato: "sem_termo", data_inicio: "2026-10-01" });

  it("sem cargo nem contrato: nada a definir", () => {
    expect(retribuicaoADefinir(valoresIniciais())).toBe(false);
  });

  it("so com cargo: nada a definir (a retribuicao pendura no contrato)", () => {
    expect(retribuicaoADefinir(comCargo(valoresIniciais()))).toBe(false);
  });

  it("so com contrato: nada a definir (o salario base vem do cargo e a base recusava com HRC11)", () => {
    expect(retribuicaoADefinir(comContrato(valoresIniciais()))).toBe(false);
  });

  it("com cargo e contrato: ha retribuicao a definir", () => {
    expect(retribuicaoADefinir(comCargo(comContrato(valoresIniciais())))).toBe(true);
  });

  it("um cargo so de espacos nao e cargo", () => {
    expect(retribuicaoADefinir(comPatch(comContrato(valoresIniciais()), "laborais", { cargo_id: "  " }))).toBe(false);
  });
});

describe("contratoCompleto", () => {
  it("sem nenhum campo, nao ha contrato completo", () => {
    expect(contratoCompleto(valoresIniciais())).toBe(false);
  });

  it("um contrato a meio (so horas, so tipo ou so data) nao esta completo", () => {
    expect(contratoCompleto(comPatch(valoresIniciais(), "contrato", { horas_trabalho: "40" }))).toBe(false);
    expect(contratoCompleto(comPatch(valoresIniciais(), "contrato", { tipo_contrato: "sem_termo" }))).toBe(false);
    expect(contratoCompleto(comPatch(valoresIniciais(), "contrato", { data_inicio: "2026-10-01" }))).toBe(false);
    expect(contratoCompleto(comPatch(valoresIniciais(), "contrato", { tipo_contrato: "sem_termo", data_inicio: "  " }))).toBe(false);
  });

  it("com tipo e data de inicio, esta completo", () => {
    expect(contratoCompleto(comPatch(valoresIniciais(), "contrato", { tipo_contrato: "sem_termo", data_inicio: "2026-10-01" }))).toBe(true);
  });
});
