/**
 * "Hoje" para a base de dados: a data UTC (`current_date` das migrations do
 * fluxo 2, sem fuso fixado). Em Lisboa no verao, entre as 00:00 e as 01:00
 * locais o dia civil local ja e o seguinte, mas a base ainda esta no anterior.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { dataDeHojeBase } from "@/lib/hr/dataBase";
import { dataDeHojeISO, periodoDecorrido } from "@/lib/hr/afectacoes";
import { dataDeHoje } from "@/lib/hr/novaPessoaDatas";
import { estadoDoPeriodo, proximoPeriodoAgendado } from "@/lib/hr/cargosPeriodos";

afterEach(() => {
  vi.useRealTimers();
});

// 00:30 de 2 de Julho em Lisboa (UTC+1) = 23:30 de 1 de Julho em UTC.
const LISBOA_00H30 = new Date("2026-07-01T23:30:00Z");
// 01:00 em Lisboa = 00:00 UTC: ja e o mesmo dia nos dois lados.
const LISBOA_01H00 = new Date("2026-07-02T00:00:00Z");

describe("dataDeHojeBase", () => {
  it("as 00:30 de Lisboa no verao ainda e o dia ANTERIOR (o da base)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(LISBOA_00H30);
    expect(dataDeHojeBase()).toBe("2026-07-01");
  });

  it("a partir das 01:00 de Lisboa o dia da base ja e o seguinte", () => {
    vi.useFakeTimers();
    vi.setSystemTime(LISBOA_01H00);
    expect(dataDeHojeBase()).toBe("2026-07-02");
  });

  it("aceita um instante explicito e devolve sempre AAAA-MM-DD", () => {
    expect(dataDeHojeBase(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-31");
    expect(dataDeHojeBase(new Date("2027-01-01T00:00:00Z"))).toBe("2027-01-01");
  });
});

describe("todos os 'hoje' do RH coincidem com o da base na janela 00:00-01:00 de Lisboa", () => {
  it("dataDeHojeISO e dataDeHoje (novaPessoa) devolvem a data UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(LISBOA_00H30);
    expect(dataDeHojeISO()).toBe("2026-07-01");
    expect(dataDeHoje()).toBe("2026-07-01");
  });

  it("periodoDecorrido usa o dia da base: um periodo que acaba em 'hoje' da base nao decorreu", () => {
    vi.useFakeTimers();
    vi.setSystemTime(LISBOA_00H30);
    expect(periodoDecorrido("2026-07-01")).toBe(false);
    expect(periodoDecorrido("2026-06-30")).toBe(true);
  });

  it("estadoDoPeriodo e proximoPeriodoAgendado sem 'hoje' explicito usam o dia da base", () => {
    vi.useFakeTimers();
    vi.setSystemTime(LISBOA_00H30);
    // Comeca no dia local seguinte, mas a base ainda esta no dia anterior: agendado.
    const amanha = { valido_de: "2026-07-02", valido_ate: null };
    expect(estadoDoPeriodo(amanha)).toBe("agendado");
    expect(estadoDoPeriodo({ valido_de: "2026-07-01", valido_ate: null })).toBe("vigente");
    expect(estadoDoPeriodo({ valido_de: "2026-06-01", valido_ate: "2026-07-01" })).toBe("passado");

    const periodos = [
      { id: "p", cargo_id: "c", salario_base: 1, periodicidade: "mensal" as const, motivo: null, ...amanha },
    ];
    expect(proximoPeriodoAgendado(periodos, "c")?.id).toBe("p");
  });
});
