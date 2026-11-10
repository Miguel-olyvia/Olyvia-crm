// A estimativa do custo pelo salario do cargo (so nos Custos): quando ha estimativa e, quando nao ha, a razao.
import { describe, expect, it } from "vitest";
import type { HrCargoPeriodo } from "./cargosPeriodos";
import { estimativaPeloCargo } from "./estimativaCusto";
import { totaisDaOrganizacao, montarLinhaCusto, type PessoaParaCusto, type ContextoCusto } from "./custoOrganizacao";

const periodo = (extra: Partial<HrCargoPeriodo> = {}): HrCargoPeriodo => ({
  id: "cp1", cargo_id: "c1", salario_base: 1500, periodicidade: "mensal", valido_de: "2026-01-01", valido_ate: null, motivo: null, ...extra,
});

const HOJE = "2026-09-15";

describe("estimativaPeloCargo", () => {
  it("cargo com periodo mensal valido no mes: estima pelo salario base, com o nome do cargo", () => {
    expect(estimativaPeloCargo({ cargoId: "c1", cargoNome: "Gerente", periodos: [periodo()], mes: "2026-09", hoje: HOJE })).toEqual({ estado: "estimado", cargo: "Gerente", salario: 1500 });
  });

  it("usa o periodo que cobre o mes (nao o mais recente)", () => {
    const periodos = [periodo({ id: "a", salario_base: 1200, valido_ate: "2026-11-01" }), periodo({ id: "b", salario_base: 1500, valido_de: "2026-11-01" })];
    expect(estimativaPeloCargo({ cargoId: "c1", cargoNome: "Gerente", periodos, mes: "2026-10", hoje: HOJE })).toMatchObject({ estado: "estimado", salario: 1200 });
    expect(estimativaPeloCargo({ cargoId: "c1", cargoNome: "Gerente", periodos, mes: "2026-12", hoje: HOJE })).toMatchObject({ estado: "estimado", salario: 1500 });
  });

  it("mes passado nao estima (o cargo e o actual): razao mes_passado; mes corrente e futuros estimam", () => {
    const entrada = { cargoId: "c1", cargoNome: "Gerente", periodos: [periodo()], hoje: HOJE };
    expect(estimativaPeloCargo({ ...entrada, mes: "2026-08" })).toEqual({ estado: "sem", razao: "mes_passado" });
    expect(estimativaPeloCargo({ ...entrada, mes: "2025-12" })).toEqual({ estado: "sem", razao: "mes_passado" });
    expect(estimativaPeloCargo({ ...entrada, mes: "2026-09" })).toMatchObject({ estado: "estimado", salario: 1500 });
    expect(estimativaPeloCargo({ ...entrada, mes: "2027-02" })).toMatchObject({ estado: "estimado", salario: 1500 });
  });

  it("sem cargo continua a ser sem_cargo mesmo num mes passado", () => {
    expect(estimativaPeloCargo({ cargoId: null, cargoNome: null, periodos: [periodo()], mes: "2026-01", hoje: HOJE })).toEqual({ estado: "sem", razao: "sem_cargo" });
  });

  it("mes anterior ao primeiro periodo do cargo nao estima (nunca se usa um periodo que comeca depois do 1.o dia do mes)", () => {
    const periodos = [periodo({ valido_de: "2026-10-01" })];
    expect(estimativaPeloCargo({ cargoId: "c1", cargoNome: "Gerente", periodos, mes: "2026-09", hoje: HOJE })).toEqual({ estado: "sem", razao: "sem_periodo" });
    expect(estimativaPeloCargo({ cargoId: "c1", cargoNome: "Gerente", periodos, mes: "2026-10", hoje: HOJE })).toMatchObject({ estado: "estimado" });
  });

  it("sem cargo: sem estimativa, razao sem_cargo", () => {
    expect(estimativaPeloCargo({ cargoId: null, cargoNome: null, periodos: [periodo()], mes: "2026-09", hoje: HOJE })).toEqual({ estado: "sem", razao: "sem_cargo" });
  });

  it("cargo sem nenhum periodo de salario, ou com o periodo ja fechado antes do mes: sem estimativa, razao sem_periodo", () => {
    expect(estimativaPeloCargo({ cargoId: "c1", cargoNome: "Gerente", periodos: [], mes: "2026-09", hoje: HOJE })).toEqual({ estado: "sem", razao: "sem_periodo" });
    expect(estimativaPeloCargo({ cargoId: "c1", cargoNome: "Gerente", periodos: [periodo({ valido_ate: "2026-03-01" })], mes: "2026-09", hoje: HOJE })).toEqual({ estado: "sem", razao: "sem_periodo" });
    expect(estimativaPeloCargo({ cargoId: "c2", cargoNome: "Outro", periodos: [periodo()], mes: "2026-09", hoje: HOJE })).toEqual({ estado: "sem", razao: "sem_periodo" });
  });

  it("periodicidade que nao e mensal: sem estimativa, razao nao_mensal (nunca se converte)", () => {
    for (const periodicidade of ["hora", "diaria", "semanal", "anual"] as const) {
      expect(estimativaPeloCargo({ cargoId: "c1", cargoNome: "Gerente", periodos: [periodo({ periodicidade })], mes: "2026-09", hoje: HOJE })).toEqual({ estado: "sem", razao: "nao_mensal" });
    }
  });

  it("salario do cargo a zero nao e estimativa", () => {
    expect(estimativaPeloCargo({ cargoId: "c1", cargoNome: "Gerente", periodos: [periodo({ salario_base: 0 })], mes: "2026-09", hoje: HOJE })).toEqual({ estado: "sem", razao: "sem_periodo" });
  });

  it("sem nome de cargo no catalogo usa o texto vazio, nunca 'null'", () => {
    expect(estimativaPeloCargo({ cargoId: "c1", cargoNome: null, periodos: [periodo()], mes: "2026-09", hoje: HOJE })).toMatchObject({ estado: "estimado", cargo: "" });
  });
});

describe("totaisDaOrganizacao: estimados", () => {
  const pessoa = (extra: Partial<PessoaParaCusto>): PessoaParaCusto => ({
    pessoaId: "p1", nome: "Ines", cargo: "Gerente", centroId: null, centro: null, filialId: null, filial: null, tipoContrato: null, retribuicaoMes: 1000, horasSemanais: 40, ...extra,
  });
  const contexto: ContextoCusto = { mes: "2026-09", avulsos: [], equipamentos: [], excecoes: {} };

  it("conta no total quem tem estimativa e diz quantos sao", () => {
    const linhas = [
      montarLinhaCusto(pessoa({}), contexto),
      montarLinhaCusto(pessoa({ pessoaId: "p2", retribuicaoMes: 1500, estimadoPeloCargo: { cargo: "Gerente", salario: 1500 } }), contexto),
      montarLinhaCusto(pessoa({ pessoaId: "p3", retribuicaoMes: null }), contexto),
    ];
    const t = totaisDaOrganizacao(linhas);
    expect(t.estimados).toBe(1);
    expect(t.retribuicao).toBe(2500);
    expect(t.semValor).toBe(1);
    expect(linhas[1]!.estimadoPeloCargo).toEqual({ cargo: "Gerente", salario: 1500 });
  });
});
