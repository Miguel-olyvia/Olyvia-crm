import { describe, expect, it } from "vitest";
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
  estado: "atribuido",
  devolucao: null,
  estadoDevolucao: null,
  autor: "RH",
  ...parcial,
});

describe("amortização do equipamento (valor / 36)", () => {
  it("no mês da entrega pesa 25 (900 / 36), faltam 35 meses e 875 por amortizar", () => {
    expect(situacaoDoEquipamento(equipamento(), "2026-01")).toEqual({
      amortizacaoMes: 25, mesesDecorridos: 1, mesesRestantes: 35, porAmortizar: 875, totalmenteAmortizado: false,
    });
  });

  it("nove meses depois já se amortizaram 225 e faltam 27 meses", () => {
    const s = situacaoDoEquipamento(equipamento(), "2026-09");
    expect(s).toMatchObject({ amortizacaoMes: 25, mesesDecorridos: 9, mesesRestantes: 27, porAmortizar: 675 });
  });

  it("o último mês conta, e a partir do 37.º não pesa nada: está totalmente amortizado", () => {
    expect(situacaoDoEquipamento(equipamento(), "2028-12")).toMatchObject({ amortizacaoMes: 25, mesesDecorridos: 36, mesesRestantes: 0, porAmortizar: 0, totalmenteAmortizado: true });
    expect(situacaoDoEquipamento(equipamento(), "2029-01")).toMatchObject({ amortizacaoMes: 0, mesesDecorridos: 36, mesesRestantes: 0, porAmortizar: 0, totalmenteAmortizado: true });
  });

  it("antes da entrega não pesa nada e ainda falta amortizar tudo", () => {
    expect(situacaoDoEquipamento(equipamento(), "2025-12")).toMatchObject({ amortizacaoMes: 0, mesesDecorridos: 0, mesesRestantes: 36, porAmortizar: 900, totalmenteAmortizado: false });
  });

  it("arredonda ao cêntimo: 1000 / 36 = 27,78 e por amortizar 972,22", () => {
    expect(situacaoDoEquipamento(equipamento({ valor: 1000 }), "2026-01")).toMatchObject({ amortizacaoMes: 27.78, porAmortizar: 972.22 });
  });

  it("devolvido: conta até ao mês da devolução (inclusive) e depois pára, sem meses nem valor por amortizar", () => {
    const devolvido = equipamento({ estado: "devolvido", devolucao: "2026-05-20", estadoDevolucao: "bom" });
    expect(situacaoDoEquipamento(devolvido, "2026-03")).toMatchObject({ amortizacaoMes: 25, mesesRestantes: 33, porAmortizar: 825 });
    expect(situacaoDoEquipamento(devolvido, "2026-05")).toMatchObject({ amortizacaoMes: 25, mesesDecorridos: 5, mesesRestantes: 0, porAmortizar: 0 });
    expect(situacaoDoEquipamento(devolvido, "2026-06")).toMatchObject({ amortizacaoMes: 0, mesesDecorridos: 5, mesesRestantes: 0, porAmortizar: 0, totalmenteAmortizado: false });
  });

  it("só os equipamentos que pesam no mês entram na lista do mês", () => {
    const lista = [equipamento(), equipamento({ id: "e2", entrega: "2022-01-10" }), equipamento({ id: "e3", estado: "devolvido", devolucao: "2026-02-02" })];
    expect(equipamentosDoMes(lista, "2026-09").map((e) => e.id)).toEqual(["e1"]);
    expect(equipamentosDoMes(lista, "2026-02").map((e) => e.id)).toEqual(["e1", "e3"]);
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
