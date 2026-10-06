/**
 * As regras de datas do cargo e do seu salario, no cliente (puras, sem base).
 *
 * Espelham o que o SQL faz em `hr_cargo_salario_em` e `hr_pessoa_cargo_em`
 * (fluxo 2): o salario de uma pessoa numa data e o salario do cargo que ela
 * tinha NESSA data, nessa data. Os periodos tem fim EXCLUSIVO.
 */
import { describe, expect, it } from "vitest";
import {
  cargoDaPessoaEm,
  compararSalario,
  diaSeguinte,
  estadoDoPeriodo,
  formatarSalario,
  periodoDoCargoEm,
  proximoPeriodoAgendado,
  segmentosHistoricoCargo,
  type HrCargoPeriodo,
  type PessoaCargoPeriodo,
} from "@/lib/hr/cargosPeriodos";

function periodo(
  cargoId: string,
  validoDe: string,
  validoAte: string | null,
  salarioBase: number,
  periodicidade: HrCargoPeriodo["periodicidade"] = "mensal",
): HrCargoPeriodo {
  return {
    id: `${cargoId}-${validoDe}`,
    cargo_id: cargoId,
    salario_base: salarioBase,
    periodicidade,
    valido_de: validoDe,
    valido_ate: validoAte,
    motivo: null,
  };
}

function linha(
  cargoId: string,
  validoDe: string,
  validoAte: string | null,
): PessoaCargoPeriodo {
  return {
    id: `p-${cargoId}-${validoDe}`,
    pessoa_id: "pessoa-1",
    cargo_id: cargoId,
    valido_de: validoDe,
    valido_ate: validoAte,
    motivo: null,
  };
}

const PERIODOS_A: HrCargoPeriodo[] = [
  periodo("A", "2025-01-01", "2026-04-01", 1000),
  periodo("A", "2026-04-01", null, 1100),
];

describe("periodoDoCargoEm", () => {
  it("devolve o periodo que cobre a data", () => {
    expect(periodoDoCargoEm(PERIODOS_A, "A", "2025-06-15")?.salario_base).toBe(1000);
    expect(periodoDoCargoEm(PERIODOS_A, "A", "2027-01-01")?.salario_base).toBe(1100);
  });

  it("o fim e EXCLUSIVO: na data de fecho ja vale o periodo seguinte", () => {
    expect(periodoDoCargoEm(PERIODOS_A, "A", "2026-03-31")?.salario_base).toBe(1000);
    expect(periodoDoCargoEm(PERIODOS_A, "A", "2026-04-01")?.salario_base).toBe(1100);
  });

  it("antes do primeiro periodo vale o primeiro (o primeiro valor vale desde sempre)", () => {
    expect(periodoDoCargoEm(PERIODOS_A, "A", "2020-01-01")?.salario_base).toBe(1000);
  });

  it("so olha para os periodos do cargo pedido", () => {
    const outros = [...PERIODOS_A, periodo("B", "2025-01-01", null, 5000)];
    expect(periodoDoCargoEm(outros, "B", "2026-06-01")?.salario_base).toBe(5000);
  });

  it("sem periodos, ou cargo sem periodos, devolve null", () => {
    expect(periodoDoCargoEm([], "A", "2026-01-01")).toBeNull();
    expect(periodoDoCargoEm(PERIODOS_A, "Z", "2026-01-01")).toBeNull();
  });

  it("nao depende da ordem em que os periodos chegam", () => {
    const desordenados = [PERIODOS_A[1], PERIODOS_A[0]];
    expect(periodoDoCargoEm(desordenados, "A", "2025-06-15")?.salario_base).toBe(1000);
  });
});

describe("cargoDaPessoaEm", () => {
  const LINHAS = [linha("A", "2025-01-01", "2026-03-01"), linha("B", "2026-03-01", null)];

  it("devolve o cargo da linha que cobre a data, com fim exclusivo", () => {
    expect(cargoDaPessoaEm(LINHAS, "2025-01-01")).toBe("A");
    expect(cargoDaPessoaEm(LINHAS, "2026-02-28")).toBe("A");
    expect(cargoDaPessoaEm(LINHAS, "2026-03-01")).toBe("B");
  });

  it("e ESTRITO: antes da primeira linha nao havia cargo", () => {
    expect(cargoDaPessoaEm(LINHAS, "2024-12-31")).toBeNull();
  });

  it("sem linhas, null", () => {
    expect(cargoDaPessoaEm([], "2026-01-01")).toBeNull();
  });
});

describe("estadoDoPeriodo e proximoPeriodoAgendado", () => {
  const HOJE = "2026-10-06";

  it("passado, vigente ou agendado", () => {
    expect(estadoDoPeriodo(periodo("A", "2025-01-01", "2026-01-01", 1), HOJE)).toBe("passado");
    expect(estadoDoPeriodo(periodo("A", "2026-01-01", null, 1), HOJE)).toBe("vigente");
    expect(estadoDoPeriodo(periodo("A", "2026-10-06", null, 1), HOJE)).toBe("vigente");
    expect(estadoDoPeriodo(periodo("A", "2026-11-01", null, 1), HOJE)).toBe("agendado");
  });

  it("um periodo que fecha hoje ja e passado (fim exclusivo)", () => {
    expect(estadoDoPeriodo(periodo("A", "2025-01-01", "2026-10-06", 1), HOJE)).toBe("passado");
  });

  it("o proximo agendado e o mais proximo, do cargo pedido", () => {
    const periodos = [
      periodo("A", "2026-01-01", "2026-12-01", 1000),
      periodo("A", "2026-12-01", null, 1200),
      periodo("B", "2026-11-01", null, 3000),
    ];
    expect(proximoPeriodoAgendado(periodos, "A", HOJE)?.salario_base).toBe(1200);
    expect(proximoPeriodoAgendado(periodos, "B", HOJE)?.salario_base).toBe(3000);
  });

  it("sem periodo no futuro, null", () => {
    expect(proximoPeriodoAgendado(PERIODOS_A, "A", HOJE)).toBeNull();
  });
});

describe("segmentosHistoricoCargo", () => {
  const CARGOS = [
    { id: "A", nome: "Comercial" },
    { id: "B", nome: "Gestor" },
  ];

  it("mudanca de cargo: um segmento por cargo, o mais recente primeiro", () => {
    const periodos = [periodo("A", "2020-01-01", null, 1000), periodo("B", "2020-01-01", null, 2000)];
    const linhas = [linha("A", "2025-01-01", "2026-03-01"), linha("B", "2026-03-01", null)];

    const segmentos = segmentosHistoricoCargo(linhas, periodos, CARGOS);

    expect(segmentos).toEqual([
      {
        cargoId: "B",
        cargoNome: "Gestor",
        desde: "2026-03-01",
        ate: null,
        salarioBase: 2000,
        periodicidade: "mensal",
      },
      {
        cargoId: "A",
        cargoNome: "Comercial",
        desde: "2025-01-01",
        ate: "2026-03-01",
        salarioBase: 1000,
        periodicidade: "mensal",
      },
    ]);
  });

  it("subida a meio do cargo: parte o segmento onde o salario do cargo muda", () => {
    const linhas = [linha("A", "2025-01-01", null)];

    const segmentos = segmentosHistoricoCargo(linhas, PERIODOS_A, CARGOS);

    expect(segmentos.map((s) => [s.desde, s.ate, s.salarioBase])).toEqual([
      ["2026-04-01", null, 1100],
      ["2025-01-01", "2026-04-01", 1000],
    ]);
    expect(segmentos.every((s) => s.cargoId === "A")).toBe(true);
  });

  it("as duas coisas: mudanca de cargo e subida dentro de um deles", () => {
    const periodos = [
      periodo("A", "2020-01-01", "2026-02-01", 1000),
      periodo("A", "2026-02-01", null, 1100),
      periodo("B", "2020-01-01", null, 2000),
    ];
    const linhas = [linha("A", "2025-01-01", "2026-03-01"), linha("B", "2026-03-01", null)];

    const segmentos = segmentosHistoricoCargo(linhas, periodos, CARGOS);

    expect(segmentos.map((s) => [s.cargoId, s.desde, s.ate, s.salarioBase])).toEqual([
      ["B", "2026-03-01", null, 2000],
      ["A", "2026-02-01", "2026-03-01", 1100],
      ["A", "2025-01-01", "2026-02-01", 1000],
    ]);
  });

  it("um periodo do cargo que nao muda o valor nao parte o segmento", () => {
    const periodos = [periodo("A", "2020-01-01", "2026-01-01", 1000), periodo("A", "2026-01-01", null, 1000)];
    const segmentos = segmentosHistoricoCargo([linha("A", "2025-01-01", null)], periodos, CARGOS);
    expect(segmentos).toHaveLength(1);
    expect(segmentos[0]).toMatchObject({ desde: "2025-01-01", ate: null, salarioBase: 1000 });
  });

  it("sem cargo antes da primeira linha: nao inventa segmento para o passado", () => {
    const segmentos = segmentosHistoricoCargo(
      [linha("A", "2026-05-01", null)],
      PERIODOS_A,
      CARGOS,
    );
    expect(segmentos).toHaveLength(1);
    expect(segmentos[0].desde).toBe("2026-05-01");
  });

  it("sem linhas, lista vazia; cargo fora do catalogo fica sem nome mas nao parte", () => {
    expect(segmentosHistoricoCargo([], PERIODOS_A, CARGOS)).toEqual([]);
    const [s] = segmentosHistoricoCargo([linha("Z", "2026-01-01", null)], [], CARGOS);
    expect(s.cargoNome).toBeNull();
    expect(s.salarioBase).toBeNull();
  });
});

describe("compararSalario", () => {
  const mensal = (valor: number) => ({ salarioBase: valor, periodicidade: "mensal" as const });

  it("primeiro: nao havia salario antes", () => {
    expect(compararSalario(null, mensal(1000))).toEqual({
      tipo: "primeiro",
      antes: null,
      depois: mensal(1000),
    });
  });

  it("igual", () => {
    expect(compararSalario(mensal(1000), mensal(1000)).tipo).toBe("igual");
  });

  it("sobe e desce", () => {
    expect(compararSalario(mensal(1000), mensal(1100)).tipo).toBe("sobe");
    expect(compararSalario(mensal(1100), mensal(1000)).tipo).toBe("desce");
  });

  it("muda de periodicidade mesmo com o mesmo numero", () => {
    const r = compararSalario(mensal(1000), { salarioBase: 1000, periodicidade: "anual" });
    expect(r.tipo).toBe("muda_periodicidade");
    expect(r.antes).toEqual(mensal(1000));
    expect(r.depois).toEqual({ salarioBase: 1000, periodicidade: "anual" });
  });
});

describe("diaSeguinte", () => {
  it("avanca um dia, incluindo fim de mes, de ano e bissexto", () => {
    expect(diaSeguinte("2026-10-06")).toBe("2026-10-07");
    expect(diaSeguinte("2026-10-31")).toBe("2026-11-01");
    expect(diaSeguinte("2026-12-31")).toBe("2027-01-01");
    expect(diaSeguinte("2028-02-28")).toBe("2028-02-29");
    expect(diaSeguinte("2027-02-28")).toBe("2027-03-01");
  });
});

describe("formatarSalario", () => {
  it("junta o valor e a periodicidade traduzida", () => {
    expect(
      formatarSalario({ salarioBase: 1500, periodicidade: "mensal" }, (chave) => `[${chave}]`),
    ).toBe("1500 [hr.periodicidade.mensal]");
  });
});
