import { describe, expect, it } from "vitest";
import { contaRepartida, contaTodosMeses, contaUmaVez } from "./comoConta";
import { custoDoMes, mesesEntre, type AvulsoCusto } from "./custoMes";
import type { EquipamentoPessoa } from "./equipamentos";

const avulso = (parcial: Partial<AvulsoCusto>): AvulsoCusto => ({
  id: "a1",
  pessoaId: "p1",
  tipo: "pontual",
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
  seguroPct: null as number | null,
  excecaoTaxa: null,
  horasSemanais: 40,
  horasFeitas: 170,
};

describe("custoDoMes", () => {
  it("os avulsos (manuais) somam ao bruto e entram na base da TSU; o equipamento so pesa nos outros custos", () => {
    const r = custoDoMes({
      ...base,
      avulsos: [avulso({ valor: 48 }), avulso({ id: "a2", valor: 52 })],
      equipamentos: [portatil()],
    });
    expect(r.avulsos).toBe(100);
    expect(r.bruto).toBe(1300);
    expect(r.parteSujeita).toBe(1200);
    expect(r.encargos).toBe(308.75);
    expect(r.outrosCustos).toBe(25);
    expect(r.total).toBe(1633.75);
  });

  it("km e ajudas ja vem na retribuicao: contam no custo uma so vez e ficam fora da base da TSU", () => {
    const r = custoDoMes({
      ...base,
      salarioMes: 1240,
      avulsos: [],
      decomposicao: { salarioBase: 1200, divisor: 14, duodecimos: 0, subsidioAlimentacao: 0, horasExtra: 0, descontoFaltas: 0, iht: null, km: { quantidade: 100, valor: 40 }, ajudas: null },
    });
    expect(r.bruto).toBe(1240);
    expect(r.avulsos).toBe(0);
    expect(r.encargosTaxa).toBe(285);
    expect(r.contas.kmEAjudas).toBe(40);
  });

  it("o seguro e do cargo e incide so sobre o salario base, nao sobre os duodecimos nem o IHT", () => {
    const r = custoDoMes({
      ...base,
      salarioMes: 1700,
      seguroPct: 5,
      avulsos: [],
      decomposicao: { salarioBase: 1200, divisor: 12, duodecimos: 200, subsidioAlimentacao: 0, horasExtra: 0, descontoFaltas: 0, iht: 300, km: null, ajudas: null },
    });
    expect(r.seguro).toBe(60);
    expect(r.encargosTaxa).toBe(403.75);
    expect(r.total).toBe(2163.75);
  });

  it("um valor anulado deixa de contar, e um de outro mês não conta neste", () => {
    const r = custoDoMes({
      ...base,
      avulsos: [
        avulso({ anulado: { motivo: "Engano", por: "RH", em: "2026-11-06T09:00:00Z" } }),
        avulso({ id: "a2", data: "2026-12-05" }),
      ],
    });
    expect(r.avulsos).toBe(0);
    expect(r.bruto).toBe(1200);
  });

  it("sem salário registado o bruto e o custo ficam sem valor (os avulsos continuam na lista)", () => {
    const r = custoDoMes({ ...base, salarioMes: null, avulsos: [avulso({})] });
    expect(r.bruto).toBeNull();
    expect(r.total).toBeNull();
    expect(r.avulsos).toBe(48);
  });

  it("a exceção por pessoa e o seguro mudam os encargos", () => {
    expect(custoDoMes({ ...base, avulsos: [], excecaoTaxa: 10 }).encargos).toBe(120);
    expect(custoDoMes({ ...base, avulsos: [], seguroPct: 2 }).encargos).toBe(309);
  });
});

describe("custoDoMes: «como conta» dos avulsos e dos equipamentos", () => {
  it("um avulso de Setembro conta em Setembro e não salta para Outubro", () => {
    const setembro = avulso({ data: "2026-09-09" });
    expect(custoDoMes({ ...base, mes: "2026-09", avulsos: [setembro] }).avulsos).toBe(48);
    expect(custoDoMes({ ...base, mes: "2026-10", avulsos: [setembro] }).avulsos).toBe(0);
    expect(custoDoMes({ ...base, mes: "2026-08", avulsos: [setembro] }).avulsos).toBe(0);
  });

  it("um avulso repartido por 2 meses conta metade em cada um, e um «todos os meses» repete-se", () => {
    const repartido = avulso({ id: "r", valor: 100, data: "2026-11-05", conta: contaRepartida(2) });
    const mensal = avulso({ id: "m", valor: 40, data: "2026-11-05", conta: contaTodosMeses("2026-11") });
    expect(custoDoMes({ ...base, mes: "2026-11", avulsos: [repartido, mensal] }).avulsos).toBe(90);
    expect(custoDoMes({ ...base, mes: "2026-12", avulsos: [repartido, mensal] }).avulsos).toBe(90);
    expect(custoDoMes({ ...base, mes: "2027-01", avulsos: [repartido, mensal] }).avulsos).toBe(40);
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

describe("mesesEntre", () => {
  it("lista os meses de um intervalo", () => {
    expect(mesesEntre("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(mesesEntre("2027-03", "2027-02")).toEqual([]);
  });
});
