/**
 * As datas civis do formulario de criar pessoa, e a garantia de que a
 * separacao de `novaPessoa.ts` em `novaPessoaDatas.ts` e `novaPessoaAdmissao.ts`
 * nao partiu quem as importava de `novaPessoa`.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import * as nova from "../novaPessoa";
import * as datas from "../novaPessoaDatas";
import * as admissao from "../novaPessoaAdmissao";

afterEach(() => {
  vi.useRealTimers();
});

describe("novaPessoaDatas", () => {
  it("o periodo experimental e uma data civil: 90 dias de 1 de Janeiro sao 1 de Abril", () => {
    expect(datas.dataDoPeriodoExperimental("2026-01-01", 90)).toBe("2026-04-01");
  });

  it("sem data de inicio ou com data invalida devolve null", () => {
    expect(datas.dataDoPeriodoExperimental("", 90)).toBeNull();
    expect(datas.dataDoPeriodoExperimental("   ", 90)).toBeNull();
    expect(datas.dataDoPeriodoExperimental("nao-e-data", 90)).toBeNull();
    expect(datas.dataFimPorDuracaoMeses("", 6)).toBeNull();
    expect(datas.dataFimPorDuracaoMeses("2026-13-45", 6)).toBeNull();
  });

  it("a duracao em meses soma meses civis, atravessando o ano", () => {
    expect(datas.dataFimPorDuracaoMeses("2026-10-15", 6)).toBe("2027-04-15");
    expect(datas.dataFimPorDuracaoMeses("2026-01-01", 12)).toBe("2027-01-01");
  });

  it("dataDeHoje e o dia da BASE (UTC, o current_date das migrations), nao o dia local", () => {
    vi.useFakeTimers();
    // 00:30 de 3 de Abril em Lisboa (UTC+1) = 23:30 de 2 de Abril em UTC. A base
    // ainda esta no dia 2: e esse o "hoje" que o RH tem de enviar-lhe (ver
    // `dataBase.ts`). Os calculos de datas civis (periodo experimental, termo)
    // continuam locais e a salvo do UTC.
    vi.setSystemTime(new Date("2026-04-02T23:30:00Z"));
    expect(datas.dataDeHoje()).toBe("2026-04-02");
  });
});

describe("a separacao de novaPessoa.ts nao partiu os importadores", () => {
  it("novaPessoa reexporta exactamente as mesmas funcoes", () => {
    expect(nova.dataDeHoje).toBe(datas.dataDeHoje);
    expect(nova.dataDoPeriodoExperimental).toBe(datas.dataDoPeriodoExperimental);
    expect(nova.dataFimPorDuracaoMeses).toBe(datas.dataFimPorDuracaoMeses);
    expect(nova.camposPorPreencherNaFicha).toBe(admissao.camposPorPreencherNaFicha);
    expect(nova.codigosObrigatoriosDoFormulario).toBe(admissao.codigosObrigatoriosDoFormulario);
  });
});
