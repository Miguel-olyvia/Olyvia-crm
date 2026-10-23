import { describe, expect, it } from "vitest";
import {
  atrasoConta,
  avisoContratadas,
  configInicial,
  corrigirVersao,
  criarExcecao,
  criarVersao,
  diaPadraoVazio,
  minutosPlaneadosDaSemana,
  minutosPlaneadosDoDiaDaSemana,
  motivoValido,
  problemasDaConfig,
  resolverHorarioDoDia,
  versaoEmVigor,
  type ConfigHorario,
  type HorarioPessoa,
  type VersaoHorario,
} from "@/components/rh-exemplo/lib/horarioTipos";

const HOJE = "2026-12-10";
const AGORA = "2026-12-10T10:00:00.000Z";

function versao(campos: Partial<VersaoHorario> = {}): VersaoHorario {
  return {
    id: "v1",
    config: configInicial("padrao"),
    desde: "2026-01-01",
    ate: null,
    motivo: "Horario inicial",
    anexoNome: null,
    autor: "Sofia",
    criadaEm: AGORA,
    corrigeId: null,
    correccao: false,
    autorizadaPor: null,
    substituidaPor: null,
    ...campos,
  };
}

const horario = (): HorarioPessoa => ({ versoes: [versao()], excecoes: [] });

function nova(h: HorarioPessoa, campos: Partial<Parameters<typeof criarVersao>[1]> = {}) {
  return criarVersao(h, {
    id: "v2",
    config: configInicial("padrao"),
    desde: "2026-12-14",
    motivo: "Acordo com a pessoa",
    anexoNome: null,
    autor: "Sofia",
    hoje: HOJE,
    agora: AGORA,
    ...campos,
  });
}

describe("horas planeadas por tipo", () => {
  it("padrao: entrada, saida e pausa por dia da semana (09-18 com 1 h de pausa = 8 h)", () => {
    const config = configInicial("padrao");
    expect(minutosPlaneadosDoDiaDaSemana(config, 1)).toBe(480);
    expect(minutosPlaneadosDoDiaDaSemana(config, 0)).toBe(0);
    expect(minutosPlaneadosDaSemana(config)).toBe(2400);
  });

  it("repartido: soma os dois periodos, a pausa longa nao conta (11-15 + 19-23 = 8 h)", () => {
    const config: ConfigHorario = { ...configInicial("repartido") };
    expect(minutosPlaneadosDoDiaDaSemana(config, 2)).toBe(480);
    expect(minutosPlaneadosDoDiaDaSemana(config, 1)).toBe(0);
    expect(minutosPlaneadosDaSemana(config)).toBe(2400);
  });

  it("isencao: horas semanais a dividir pelos dias de trabalho (40 h / 5 = 8 h)", () => {
    const config = configInicial("isencao");
    expect(minutosPlaneadosDoDiaDaSemana(config, 3)).toBe(480);
    expect(minutosPlaneadosDoDiaDaSemana(config, 6)).toBe(0);
    expect(minutosPlaneadosDaSemana(config)).toBe(2400);
  });

  it("livre: so o total da semana; por dia nao ha horas planeadas", () => {
    const config = { ...configInicial("livre"), livre: { dias: [1, 2, 3, 4, 5], horasSemanais: 32 } };
    expect(minutosPlaneadosDoDiaDaSemana(config, 1)).toBe(0);
    expect(minutosPlaneadosDaSemana(config)).toBe(1920);
  });

  it("banco de horas: contas do dia como o padrao", () => {
    expect(minutosPlaneadosDoDiaDaSemana(configInicial("banco"), 5)).toBe(480);
  });
});

describe("validacao do horario por tipo", () => {
  it("padrao valido nao tem problemas", () => {
    expect(problemasDaConfig(configInicial("padrao"))).toEqual([]);
  });

  it("padrao: saida antes da entrada recusa", () => {
    const config = configInicial("padrao");
    config.padrao = config.padrao.map((d, i) => (i === 1 ? { ...d, entrada: "18:00", saida: "09:00" } : d));
    expect(problemasDaConfig(config)).toEqual(["rhExemplo.hor.erro.fimAntesInicio"]);
  });

  it("padrao sem nenhum dia de trabalho recusa", () => {
    const config = { ...configInicial("padrao"), padrao: Array.from({ length: 7 }, () => diaPadraoVazio(false)) };
    expect(problemasDaConfig(config)).toContain("rhExemplo.hor.erro.semDias");
  });

  it("repartido: os periodos tem de ter intervalo entre eles", () => {
    const config = configInicial("repartido");
    config.repartido = { ...config.repartido, p2Inicio: "14:30" };
    expect(problemasDaConfig(config)).toEqual(["rhExemplo.hor.erro.semIntervalo"]);
  });

  it("isencao e livre recusam horas a zero ou sem dias", () => {
    const isencao = { ...configInicial("isencao"), isencao: { dias: [1], horasSemanais: 0 } };
    expect(problemasDaConfig(isencao)).toEqual(["rhExemplo.hor.erro.horasInvalidas"]);
    const livre = { ...configInicial("livre"), livre: { dias: [], horasSemanais: 40 } };
    expect(problemasDaConfig(livre)).toEqual(["rhExemplo.hor.erro.semDias"]);
  });

  it("banco: saldo minimo positivo recusa", () => {
    const config = configInicial("banco");
    config.banco = { ...config.banco, saldoMinimo: 5 };
    expect(problemasDaConfig(config)).toEqual(["rhExemplo.hor.erro.limitesInvalidos"]);
  });

  it("aviso (nao bloqueia) quando o total difere das horas contratadas", () => {
    expect(avisoContratadas(configInicial("padrao"), 40)).toBe(false);
    expect(avisoContratadas(configInicial("padrao"), 35)).toBe(true);
    expect(avisoContratadas(configInicial("padrao"), null)).toBe(false);
  });
});

describe("motivo", () => {
  it.each([
    ["", false],
    ["  ab ", false],
    ["abc", true],
    ["  abc  ", true],
  ])("motivo %j valido = %s", (texto, esperado) => {
    expect(motivoValido(texto)).toBe(esperado);
  });
  it("null e undefined nao sao validos", () => {
    expect(motivoValido(null)).toBe(false);
    expect(motivoValido(undefined)).toBe(false);
  });
});

describe("nova versao", () => {
  it("sem motivo recusa", () => {
    expect(nova(horario(), { motivo: "ab" })).toEqual({ ok: false, erro: "rhExemplo.hor.erro.motivoCurto" });
  });

  it("data de efeito no passado recusa (usar corrigir)", () => {
    expect(nova(horario(), { desde: "2026-12-09" })).toEqual({ ok: false, erro: "rhExemplo.hor.erro.dataPassada" });
  });

  it("a versao em vigor fecha na vespera e a nova abre; a antiga nunca se apaga", () => {
    const resultado = nova(horario(), { anexoNome: "acordo.pdf" });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const [antiga, atual] = resultado.valor.versoes;
    expect(resultado.valor.versoes).toHaveLength(2);
    expect(antiga.ate).toBe("2026-12-13");
    expect(antiga.motivo).toBe("Horario inicial");
    expect(atual).toMatchObject({ desde: "2026-12-14", ate: null, anexoNome: "acordo.pdf", correccao: false });
  });

  it("nao altera o horario recebido", () => {
    const original = horario();
    nova(original);
    expect(original.versoes).toHaveLength(1);
    expect(original.versoes[0].ate).toBeNull();
  });

  it("recusa uma data que nao e depois do inicio da versao aberta", () => {
    const h: HorarioPessoa = { versoes: [versao({ desde: "2026-12-20" })], excecoes: [] };
    expect(nova(h, { desde: "2026-12-15" })).toEqual({ ok: false, erro: "rhExemplo.hor.erro.antesDaVersao" });
  });

  it("recusa uma configuracao invalida", () => {
    const config = { ...configInicial("isencao"), isencao: { dias: [], horasSemanais: 40 } };
    expect(nova(horario(), { config })).toEqual({ ok: false, erro: "rhExemplo.hor.erro.semDias" });
  });
});

describe("corrigir o passado", () => {
  const dados = { id: "v3", versaoId: "v1", config: configInicial("isencao"), motivo: "Tipo errado", autorizado: true, autor: "Sofia", agora: AGORA };

  it("sem autorizacao recusa", () => {
    expect(corrigirVersao(horario(), { ...dados, autorizado: false })).toEqual({ ok: false, erro: "rhExemplo.hor.erro.semAutorizacao" });
  });

  it("sem motivo recusa", () => {
    expect(corrigirVersao(horario(), { ...dados, motivo: "x" })).toEqual({ ok: false, erro: "rhExemplo.hor.erro.motivoCurto" });
  });

  it("versao inexistente recusa", () => {
    expect(corrigirVersao(horario(), { ...dados, versaoId: "nada" })).toEqual({ ok: false, erro: "rhExemplo.hor.erro.versaoInexistente" });
  });

  it("grava uma linha nova marcada como correccao, com as mesmas datas, e a errada fica no historico", () => {
    const resultado = corrigirVersao(horario(), dados);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const [errada, certa] = resultado.valor.versoes;
    expect(errada).toMatchObject({ id: "v1", substituidaPor: "v3" });
    expect(certa).toMatchObject({ id: "v3", corrigeId: "v1", correccao: true, autorizadaPor: "Sofia", desde: "2026-01-01", ate: null });
    expect(versaoEmVigor(resultado.valor, "2026-06-01")?.id).toBe("v3");
  });
});

describe("excecao de um dia e horario do dia", () => {
  const excecao = { id: "e1", data: "2026-12-15", dia: { trabalha: true, entrada: "10:00", saida: "14:00", pausaMin: 0 }, motivo: "Consulta", autor: "Sofia", hoje: HOJE, agora: AGORA };

  it("a excecao com essa data substitui o horario normal da semana", () => {
    const criado = criarExcecao(horario(), excecao);
    expect(criado.ok).toBe(true);
    if (!criado.ok) return;
    expect(resolverHorarioDoDia(criado.valor, "2026-12-15")).toMatchObject({ origem: "excecao", minutosPlaneados: 240, tipo: "padrao" });
    expect(resolverHorarioDoDia(criado.valor, "2026-12-16")).toMatchObject({ origem: "versao", minutosPlaneados: 480 });
  });

  it("sem excecao vale o dia da semana; fim de semana tem 0", () => {
    expect(resolverHorarioDoDia(horario(), "2026-12-12")).toMatchObject({ origem: "versao", minutosPlaneados: 0 });
  });

  it("antes de qualquer versao nao ha horario", () => {
    expect(resolverHorarioDoDia(horario(), "2025-12-01")).toMatchObject({ origem: "sem_horario", minutosPlaneados: 0, tipo: null });
  });

  it("recusa excecao no passado, sem motivo, duplicada ou com dia invalido", () => {
    expect(criarExcecao(horario(), { ...excecao, data: "2026-12-09" })).toEqual({ ok: false, erro: "rhExemplo.hor.erro.dataPassada" });
    expect(criarExcecao(horario(), { ...excecao, motivo: "" })).toEqual({ ok: false, erro: "rhExemplo.hor.erro.motivoCurto" });
    expect(criarExcecao(horario(), { ...excecao, dia: { ...excecao.dia, saida: "09:00" } })).toEqual({ ok: false, erro: "rhExemplo.hor.erro.fimAntesInicio" });
    const criado = criarExcecao(horario(), excecao);
    if (criado.ok) expect(criarExcecao(criado.valor, { ...excecao, id: "e2" })).toEqual({ ok: false, erro: "rhExemplo.hor.erro.excecaoJaExiste" });
  });
});

describe("tolerancia de atraso", () => {
  it("5 minutos nao e atraso; 6 e", () => {
    expect(atrasoConta(5)).toBe(false);
    expect(atrasoConta(6)).toBe(true);
    expect(atrasoConta(12)).toBe(true);
  });
});
