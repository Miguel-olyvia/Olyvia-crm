import { describe, expect, it } from "vitest";
import { contaRepartida, contaTodosMeses, contaUmaVez } from "./comoConta";
import {
  situacaoDoEquipamento,
  validarDevolucao,
  validarEquipamento,
  equipamentosDoMes,
  type EquipamentoPessoa,
} from "./equipamentos";

const equipamento = (parcial: Partial<EquipamentoPessoa> = {}): EquipamentoPessoa => ({
  id: "e1",
  pessoaId: "p1",
  tipo: "portatil",
  descricao: "Portátil",
  valor: 900,
  entrega: "2026-01-15",
  conta: contaRepartida(),
  estado: "atribuido",
  devolucao: null,
  estadoDevolucao: null,
  autor: "RH",
  ...parcial,
});

describe("equipamento repartido por 36 meses (o do fluxo 11: valor / 36)", () => {
  it("no mês da entrega conta 25 (900 / 36), faltam 35 meses e 875 por contar", () => {
    expect(situacaoDoEquipamento(equipamento(), "2026-01")).toEqual({
      doMes: 25, contado: 25, falta: 875, mesesContados: 1, mesesFalta: 35, completo: false,
    });
  });

  it("nove meses depois já contaram 225 e faltam 27 meses", () => {
    const s = situacaoDoEquipamento(equipamento(), "2026-09");
    expect(s).toMatchObject({ doMes: 25, contado: 225, mesesContados: 9, mesesFalta: 27, falta: 675 });
  });

  it("o último mês conta, e a partir do 37.º não conta nada: já contou tudo", () => {
    expect(situacaoDoEquipamento(equipamento(), "2028-12")).toMatchObject({ doMes: 25, contado: 900, mesesContados: 36, mesesFalta: 0, falta: 0, completo: true });
    expect(situacaoDoEquipamento(equipamento(), "2029-01")).toMatchObject({ doMes: 0, contado: 900, mesesContados: 36, mesesFalta: 0, falta: 0, completo: true });
  });

  it("antes da entrega não conta nada e ainda falta contar tudo", () => {
    expect(situacaoDoEquipamento(equipamento(), "2025-12")).toMatchObject({ doMes: 0, contado: 0, mesesContados: 0, mesesFalta: 36, falta: 900, completo: false });
  });

  it("arredonda ao cêntimo: 1000 / 36 = 27,78 e faltam 972,22", () => {
    expect(situacaoDoEquipamento(equipamento({ valor: 1000 }), "2026-01")).toMatchObject({ doMes: 27.78, falta: 972.22 });
  });

  it("devolvido: conta até ao mês da devolução (inclusive) e depois pára, sem meses nem valor por contar", () => {
    const devolvido = equipamento({ estado: "devolvido", devolucao: "2026-05-20", estadoDevolucao: "bom" });
    expect(situacaoDoEquipamento(devolvido, "2026-03")).toMatchObject({ doMes: 25, mesesFalta: 33, falta: 825 });
    expect(situacaoDoEquipamento(devolvido, "2026-05")).toMatchObject({ doMes: 25, mesesContados: 5, mesesFalta: 0, falta: 0 });
    expect(situacaoDoEquipamento(devolvido, "2026-06")).toMatchObject({ doMes: 0, mesesContados: 5, mesesFalta: 0, falta: 0, completo: false });
  });

  it("só os equipamentos que contam no mês entram na lista do mês", () => {
    const lista = [equipamento(), equipamento({ id: "e2", entrega: "2022-01-10" }), equipamento({ id: "e3", estado: "devolvido", devolucao: "2026-02-02" })];
    expect(equipamentosDoMes(lista, "2026-09").map((e) => e.id)).toEqual(["e1"]);
    expect(equipamentosDoMes(lista, "2026-02").map((e) => e.id)).toEqual(["e1", "e3"]);
  });
});

describe("equipamento pago de uma vez e todos os meses", () => {
  it("pago de uma vez conta o valor todo só no mês da entrega, e entra na lista só nesse mês", () => {
    const telemovel = equipamento({ valor: 600, entrega: "2026-09-10", conta: contaUmaVez() });
    expect(situacaoDoEquipamento(telemovel, "2026-08")).toMatchObject({ doMes: 0, contado: 0, falta: 600 });
    expect(situacaoDoEquipamento(telemovel, "2026-09")).toMatchObject({ doMes: 600, contado: 600, falta: 0, completo: true });
    expect(situacaoDoEquipamento(telemovel, "2026-10")).toMatchObject({ doMes: 0, contado: 600, falta: 0 });
    expect(equipamentosDoMes([telemovel], "2026-09")).toHaveLength(1);
    expect(equipamentosDoMes([telemovel], "2026-10")).toHaveLength(0);
  });

  it("repartido por 12 meses conta 75 por mês durante 12 meses (900 / 12) e depois nada", () => {
    const e = equipamento({ conta: contaRepartida(12) });
    expect(situacaoDoEquipamento(e, "2026-01")).toMatchObject({ doMes: 75, falta: 825, mesesFalta: 11 });
    expect(situacaoDoEquipamento(e, "2026-12")).toMatchObject({ doMes: 75, falta: 0, completo: true });
    expect(situacaoDoEquipamento(e, "2027-01").doMes).toBe(0);
  });

  it("todos os meses conta o valor mensal do início ao fim, sem total, e a devolução corta", () => {
    const viatura = equipamento({ valor: 389, conta: contaTodosMeses("2026-02") });
    expect(situacaoDoEquipamento(viatura, "2026-01").doMes).toBe(0);
    expect(situacaoDoEquipamento(viatura, "2026-02")).toMatchObject({ doMes: 389, contado: 389, falta: null, mesesFalta: null, completo: false });
    expect(situacaoDoEquipamento(viatura, "2027-05")).toMatchObject({ doMes: 389, contado: 389 * 16 });
    const devolvida = { ...viatura, estado: "devolvido" as const, devolucao: "2026-06-30" };
    expect(situacaoDoEquipamento(devolvida, "2026-06").doMes).toBe(389);
    expect(situacaoDoEquipamento(devolvida, "2026-07").doMes).toBe(0);
  });
});

describe("validar um equipamento e uma devolução", () => {
  const ok = { pessoaId: "p1", descricao: "Telemóvel", valor: 500, entrega: "2026-09-01" };

  it("recusa sem pessoa, sem descrição, com valor 0 ou negativo e sem data, por esta ordem", () => {
    expect(validarEquipamento(ok)).toBeNull();
    expect(validarEquipamento({ ...ok, pessoaId: "" })).toBe("semPessoa");
    expect(validarEquipamento({ ...ok, descricao: "   " })).toBe("semDescricao");
    expect(validarEquipamento({ ...ok, valor: 0 })).toBe("valorZero");
    expect(validarEquipamento({ ...ok, valor: -5 })).toBe("valorZero");
    expect(validarEquipamento({ ...ok, valor: Number.NaN })).toBe("valorZero");
    expect(validarEquipamento({ ...ok, entrega: "" })).toBe("semData");
  });

  it("recusa um «como conta» inválido: meses fora de 1 a 120, sem mês de início ou com o fim antes do início", () => {
    expect(validarEquipamento({ ...ok, conta: contaRepartida(12) })).toBeNull();
    expect(validarEquipamento({ ...ok, conta: contaRepartida(0) })).toBe("mesesInvalidos");
    expect(validarEquipamento({ ...ok, conta: contaRepartida(121) })).toBe("mesesInvalidos");
    expect(validarEquipamento({ ...ok, conta: contaTodosMeses("") })).toBe("semInicio");
    expect(validarEquipamento({ ...ok, conta: contaTodosMeses("2026-09", "2026-08") })).toBe("fimAntesInicio");
  });

  it("a devolução pede data, não pode ser antes da entrega e pede o estado em que volta", () => {
    const e = equipamento({ entrega: "2026-03-10" });
    expect(validarDevolucao(e, "2026-09-01", "bom")).toBeNull();
    expect(validarDevolucao(e, "", "bom")).toBe("semData");
    expect(validarDevolucao(e, "2026-03-09", "bom")).toBe("antesDaEntrega");
    expect(validarDevolucao(e, "2026-03-10", "bom")).toBeNull();
    expect(validarDevolucao(e, "2026-09-01", "")).toBe("semEstado");
    expect(validarDevolucao(e, "2026-09-01", "perdido")).toBe("semEstado");
  });
});
