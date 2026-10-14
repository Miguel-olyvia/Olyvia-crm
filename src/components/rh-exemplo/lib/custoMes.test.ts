import { describe, expect, it } from "vitest";
import { acumulados, custoDoMes, mesesEntre, type AvulsoCusto, type DefinicoesCusto } from "./custoMes";

const DEFINICOES: DefinicoesCusto = { taxaEmpresa: 23.75, seguro: 0, valorPorKm: 0.4, ajudaPorDia: 25 };

const avulso = (parcial: Partial<AvulsoCusto>): AvulsoCusto => ({
  id: "a1",
  pessoaId: "p1",
  tipo: "km",
  data: "2026-11-05",
  mesContagem: "2026-11",
  dataReal: null,
  descricao: "Visita",
  quantidade: 120,
  valorUnitario: 0.4,
  valor: 48,
  devolucao: null,
  autor: "RH",
  criadoEm: "2026-11-05T10:00:00Z",
  anulado: null,
  ...parcial,
});

const base = {
  mes: "2026-11",
  salarioMes: 1200,
  definicoes: DEFINICOES,
  excecaoTaxa: null,
  horasSemanais: 40,
  saldoHoras: 3,
  horasFeitas: 170,
};

describe("custoDoMes", () => {
  it("soma km e ajudas ao bruto mas não à parte sujeita; o equipamento só pesa nos outros custos", () => {
    const r = custoDoMes({
      ...base,
      avulsos: [
        avulso({}),
        avulso({ id: "a2", tipo: "ajuda", valor: 50, quantidade: 2, valorUnitario: 25 }),
        avulso({ id: "a3", tipo: "equipamento", data: "2026-09-10", mesContagem: "2026-09", valor: 900, valorUnitario: 900, quantidade: 1 }),
      ],
    });
    expect(r.kmEAjudas).toBe(98);
    expect(r.bruto).toBe(1298);
    expect(r.parteSujeita).toBe(1200);
    expect(r.encargos).toBe(285);
    expect(r.outrosCustos).toBe(25);
    expect(r.total).toBe(1608);
    expect(r.repartido).toBe(1685);
    expect(r.porHoraPrevista).toBe(9.57);
    expect(r.porHoraFeita).toBe(9.46);
    expect(r.saldoEuros).toBe(21.43);
  });

  it("um valor anulado deixa de contar, e um de outro mês não conta neste", () => {
    const r = custoDoMes({
      ...base,
      avulsos: [
        avulso({ anulado: { motivo: "Engano", por: "RH", em: "2026-11-06T09:00:00Z" } }),
        avulso({ id: "a2", mesContagem: "2026-12" }),
      ],
    });
    expect(r.kmEAjudas).toBe(0);
    expect(r.bruto).toBe(1200);
  });

  it("sem salário registado o bruto e o custo ficam sem valor (os avulsos continuam na lista)", () => {
    const r = custoDoMes({ ...base, salarioMes: null, avulsos: [avulso({})] });
    expect(r.bruto).toBeNull();
    expect(r.total).toBeNull();
    expect(r.repartido).toBeNull();
    expect(r.saldoEuros).toBeNull();
    expect(r.kmEAjudas).toBe(48);
  });

  it("a exceção por pessoa e o seguro mudam os encargos", () => {
    expect(custoDoMes({ ...base, avulsos: [], excecaoTaxa: 10 }).encargos).toBe(120);
    expect(custoDoMes({ ...base, avulsos: [], definicoes: { ...DEFINICOES, seguro: 2 } }).encargos).toBe(309);
  });
});

describe("acumulados", () => {
  it("lista os meses de um intervalo", () => {
    expect(mesesEntre("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(mesesEntre("2027-03", "2027-02")).toEqual([]);
  });

  it("o ano começa em janeiro ou no mês de admissão; desde a admissão soma tudo", () => {
    const totais = new Map<string, number | null>([
      ["2025-12", 100],
      ["2026-01", 10],
      ["2026-02", 20],
      ["2026-03", null],
      ["2026-04", 40],
    ]);
    expect(acumulados(totais, "2025-12", "2026-04")).toEqual({ ano: 70, admissao: 170 });
    expect(acumulados(totais, "2026-03", "2026-04")).toEqual({ ano: 40, admissao: 40 });
    expect(acumulados(totais, null, "2026-04")).toEqual({ ano: 40, admissao: 40 });
  });
});
