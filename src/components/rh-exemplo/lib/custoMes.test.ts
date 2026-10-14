import { describe, expect, it } from "vitest";
import { contaRepartida, contaTodosMeses, contaUmaVez } from "./comoConta";
import { acumulados, custoDoMes, mesesEntre, type AvulsoCusto, type DefinicoesCusto } from "./custoMes";
import type { EquipamentoPessoa } from "./equipamentos";

const DEFINICOES: DefinicoesCusto = { taxaEmpresa: 23.75, seguro: 0, valorPorKm: 0.4, ajudaPorDia: 25 };

const avulso = (parcial: Partial<AvulsoCusto>): AvulsoCusto => ({
  id: "a1",
  pessoaId: "p1",
  tipo: "km",
  data: "2026-11-05",
  conta: contaUmaVez(),
  descricao: "Visita",
  quantidade: 120,
  valorUnitario: 0.4,
  valor: 48,
  autor: "RH",
  criadoEm: "2026-11-05T10:00:00Z",
  anulado: null,
  ...parcial,
});

const portatil = (parcial: Partial<EquipamentoPessoa> = {}): EquipamentoPessoa => ({
  id: "e1",
  pessoaId: "p1",
  tipo: "portatil",
  descricao: "Portátil",
  valor: 900,
  entrega: "2026-09-10",
  conta: contaRepartida(),
  estado: "atribuido",
  devolucao: null,
  estadoDevolucao: null,
  autor: "RH",
  ...parcial,
});

const base = {
  equipamentos: [] as EquipamentoPessoa[],
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
      avulsos: [avulso({}), avulso({ id: "a2", tipo: "ajuda", valor: 50, quantidade: 2, valorUnitario: 25 })],
      equipamentos: [portatil()],
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
        avulso({ id: "a2", data: "2026-12-05" }),
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

describe("custoDoMes: «como conta» dos avulsos e dos equipamentos", () => {
  it("um avulso de Setembro conta em Setembro e não salta para Outubro", () => {
    const setembro = avulso({ data: "2026-09-09" });
    expect(custoDoMes({ ...base, mes: "2026-09", avulsos: [setembro] }).kmEAjudas).toBe(48);
    expect(custoDoMes({ ...base, mes: "2026-10", avulsos: [setembro] }).kmEAjudas).toBe(0);
    expect(custoDoMes({ ...base, mes: "2026-08", avulsos: [setembro] }).kmEAjudas).toBe(0);
  });

  it("um avulso repartido por 2 meses conta metade em cada um, e um «todos os meses» repete-se", () => {
    const repartido = avulso({ id: "r", valor: 100, data: "2026-11-05", conta: contaRepartida(2) });
    const mensal = avulso({ id: "m", valor: 40, data: "2026-11-05", conta: contaTodosMeses("2026-11") });
    expect(custoDoMes({ ...base, mes: "2026-11", avulsos: [repartido, mensal] }).kmEAjudas).toBe(90);
    expect(custoDoMes({ ...base, mes: "2026-12", avulsos: [repartido, mensal] }).kmEAjudas).toBe(90);
    expect(custoDoMes({ ...base, mes: "2027-01", avulsos: [repartido, mensal] }).kmEAjudas).toBe(40);
  });

  it("um equipamento pago de uma vez só pesa no mês da entrega, e um repartido todos os meses do período", () => {
    const telemovel = portatil({ id: "t", valor: 600, entrega: "2026-11-10", conta: contaUmaVez() });
    const lista = [telemovel, portatil()];
    const nov = custoDoMes({ ...base, mes: "2026-11", avulsos: [], equipamentos: lista });
    const dez = custoDoMes({ ...base, mes: "2026-12", avulsos: [], equipamentos: lista });
    expect(nov).toMatchObject({ outrosCustos: 625, nEquipamentos: 2 });
    expect(dez).toMatchObject({ outrosCustos: 25, nEquipamentos: 1 });
  });

  it("o equipamento nunca entra no bruto nem na parte sujeita, seja qual for o modo", () => {
    const r = custoDoMes({ ...base, avulsos: [], equipamentos: [portatil({ conta: contaUmaVez() })], mes: "2026-09" });
    expect(r.bruto).toBe(1200);
    expect(r.parteSujeita).toBe(1200);
    expect(r.outrosCustos).toBe(900);
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
