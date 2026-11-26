// A frase que o formulário mostra enquanto se preenche («Perde 33,33 € por mês durante 36 meses», «Custa 450 € por mês...») e a vida do
// equipamento do catálogo em meses. Puras: só dependem do que está escrito nos campos.
import { describe, expect, it } from "vitest";
import { previaDaConta, vidaDoCatalogoEmMeses } from "./previaAtivo";
import type { CamposAtivo } from "./validarAtivo";

const COMPRADO: CamposAtivo = {
  grupo: "pessoa", nome: "Portátil", tipo: "portatil", catEquipamentoId: "", codigo: "", numSerie: "", dataCompra: "2027-01-05", valorCompra: "1200",
  valorResidual: "", vidaMeses: "36", manutencaoAno: "", centroCustoId: "", localizacao: "", notas: "", forma: "comprado", vidaOrigem: "manual",
  vidaCatalogoMeses: null, rendaMensal: "", inicioAluguer: "", fimAluguer: "", armazemId: "",
};
const ALUGADO: CamposAtivo = { ...COMPRADO, forma: "alugado", valorCompra: "", dataCompra: "", vidaMeses: "", rendaMensal: "450", inicioAluguer: "2026-01-01" };

describe("vidaDoCatalogoEmMeses", () => {
  it("anos x 12, de 1 a 600", () => {
    expect(vidaDoCatalogoEmMeses(3)).toBe(36);
    expect(vidaDoCatalogoEmMeses(0.5)).toBe(6);
    expect(vidaDoCatalogoEmMeses(100)).toBe(600);
    expect(vidaDoCatalogoEmMeses(0.01)).toBe(1);
  });
  it("sem vida em anos (só horas, ou nada) não há vida em meses", () => {
    expect(vidaDoCatalogoEmMeses(null)).toBeNull();
    expect(vidaDoCatalogoEmMeses(0)).toBeNull();
  });
});

describe("previaDaConta", () => {
  it("comprado: a quota por mês, os meses e o mês da última quota (1 200 € a 36 meses = 33,33 € até 12/2029)", () => {
    expect(previaDaConta(COMPRADO)).toEqual({ tipo: "comprado", quota: 33.33, meses: 36, fim: "2029-12" });
  });

  it("o residual não se amortiza: 1 200 € com 200 € de residual a 10 meses = 100 € por mês", () => {
    expect(previaDaConta({ ...COMPRADO, valorResidual: "200", vidaMeses: "10" })).toMatchObject({ quota: 100, meses: 10, fim: "2027-10" });
  });

  it("do catálogo (pessoa) usa a vida do equipamento escolhido", () => {
    expect(previaDaConta({ ...COMPRADO, vidaOrigem: "catalogo", vidaMeses: "", catEquipamentoId: "c1", vidaCatalogoMeses: 24 })).toMatchObject({ meses: 24, fim: "2028-12" });
  });

  it("sem os dados para a conta (valor, vida ou data por preencher) não há prévia", () => {
    expect(previaDaConta({ ...COMPRADO, valorCompra: "" })).toBeNull();
    expect(previaDaConta({ ...COMPRADO, vidaMeses: "" })).toBeNull();
    expect(previaDaConta({ ...COMPRADO, vidaMeses: "0" })).toBeNull();
    expect(previaDaConta({ ...COMPRADO, vidaMeses: "601" })).toBeNull();
    expect(previaDaConta({ ...COMPRADO, dataCompra: "" })).toBeNull();
    expect(previaDaConta({ ...COMPRADO, vidaOrigem: "catalogo", vidaMeses: "", vidaCatalogoMeses: null })).toBeNull();
  });

  it("serviço do catálogo: a vida é a do modelo ao vivo, não há prévia no formulário", () => {
    expect(previaDaConta({ ...COMPRADO, grupo: "servico", tipo: "", vidaOrigem: "catalogo", vidaMeses: "" })).toBeNull();
  });

  it("alugado com fim: a renda, o início e o fim", () => {
    expect(previaDaConta({ ...ALUGADO, fimAluguer: "2029-12-31" })).toEqual({ tipo: "alugadoFim", renda: 450, inicio: "2026-01-01", fim: "2029-12-31" });
  });

  it("alugado sem fim: diz que não tem data de fim", () => {
    expect(previaDaConta(ALUGADO)).toEqual({ tipo: "alugadoSemFim", renda: 450, inicio: "2026-01-01" });
  });

  it("alugado sem renda ou sem início: sem prévia; um fim ilegível conta como sem fim", () => {
    expect(previaDaConta({ ...ALUGADO, rendaMensal: "" })).toBeNull();
    expect(previaDaConta({ ...ALUGADO, inicioAluguer: "" })).toBeNull();
    expect(previaDaConta({ ...ALUGADO, fimAluguer: "lixo" })).toEqual({ tipo: "alugadoSemFim", renda: 450, inicio: "2026-01-01" });
  });

  it("o serviço nunca é alugado: ignora a forma", () => {
    expect(previaDaConta({ ...ALUGADO, grupo: "servico", tipo: "" })).toBeNull();
  });
});
