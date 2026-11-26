// «Corrigir equipamento» e «Corrigir datas»: só vão para a base os campos que mudaram (p_campos), e a validação local diz o que falta.
import { describe, expect, it } from "vitest";
import { contaUmaVez } from "@/components/rh-exemplo/lib/comoConta";
import type { AtivoDoEquipamento, EquipamentoPessoa } from "@/components/rh-exemplo/lib/equipamentos";
import { correcaoDeDatas, correcaoDoFormulario, formularioDaCorrecao } from "./correcaoEquipamento";

const comprado: Extract<AtivoDoEquipamento, { forma: "comprado" }> = {
  forma: "comprado", codigo: "PC-0001", nome: "Portátil", tipo: "portatil", estado: "ativo", valorCompra: 1200, valorResidual: 0,
  dataCompra: "2027-01-05", vidaMeses: 36, vidaOrigem: "pagamento", desativadoEm: null,
};
const alugado: Extract<AtivoDoEquipamento, { forma: "alugado" }> = {
  forma: "alugado", codigo: "VIA-0001", nome: "Viatura", tipo: "viatura", estado: "ativo", rendaMensal: 450, inicioAluguer: "2026-01-01",
  fimAluguer: "2029-12-31", desativadoEm: null,
};

describe("correcaoDoFormulario: comprado", () => {
  it("parte dos valores do ativo e, sem mexer em nada, diz que não há nada a corrigir", () => {
    const f = formularioDaCorrecao(comprado);
    expect(f).toMatchObject({ nome: "Portátil", valorCompra: "1200", valorResidual: "0", dataCompra: "2027-01-05", vidaMeses: "36" });
    expect(correcaoDoFormulario(comprado, f)).toEqual({ correcao: null, erro: "nada" });
  });

  it("só os campos que mudaram; mudar a vida passa a origem a «manual»", () => {
    const f = { ...formularioDaCorrecao(comprado), valorCompra: "1300,50", vidaMeses: "48" };
    expect(correcaoDoFormulario(comprado, f)).toEqual({
      correcao: { campos: ["valor_compra", "vida_meses", "vida_origem"], valorCompra: 1300.5, vidaMeses: 48, vidaOrigem: "manual" },
      erro: null,
    });
  });

  it("recusa nome vazio, valor a zero, residual acima da compra, data inválida e vida fora de 1 a 600", () => {
    const base = formularioDaCorrecao(comprado);
    expect(correcaoDoFormulario(comprado, { ...base, nome: " " }).erro).toBe("nome");
    expect(correcaoDoFormulario(comprado, { ...base, valorCompra: "0" }).erro).toBe("valorCompra");
    expect(correcaoDoFormulario(comprado, { ...base, valorResidual: "1300" }).erro).toBe("residual");
    expect(correcaoDoFormulario(comprado, { ...base, dataCompra: "" }).erro).toBe("dataCompra");
    expect(correcaoDoFormulario(comprado, { ...base, vidaMeses: "0" }).erro).toBe("vida");
    expect(correcaoDoFormulario(comprado, { ...base, vidaMeses: "601" }).erro).toBe("vida");
    expect(correcaoDoFormulario(comprado, { ...base, vidaMeses: "12,5" }).erro).toBe("vida");
  });
});

describe("correcaoDoFormulario: alugado", () => {
  it("corrige a renda; limpar o fim manda 'fim_aluguer' em campos com o fim nulo", () => {
    const f = { ...formularioDaCorrecao(alugado), rendaMensal: "480", fimAluguer: "" };
    expect(correcaoDoFormulario(alugado, f)).toEqual({
      correcao: { campos: ["renda_mensal", "fim_aluguer"], rendaMensal: 480, fimAluguer: null },
      erro: null,
    });
  });

  it("recusa renda a zero, início em falta e fim antes do início", () => {
    const base = formularioDaCorrecao(alugado);
    expect(correcaoDoFormulario(alugado, { ...base, rendaMensal: "0" }).erro).toBe("renda");
    expect(correcaoDoFormulario(alugado, { ...base, inicioAluguer: "" }).erro).toBe("inicio");
    expect(correcaoDoFormulario(alugado, { ...base, fimAluguer: "2025-12-31" }).erro).toBe("fimAntesInicio");
  });
});

describe("correcaoDeDatas: a entrega e a devolução desta linha", () => {
  const linha = (p: Partial<EquipamentoPessoa> = {}): EquipamentoPessoa => ({
    id: "pe-1", pessoaId: "p1", tipo: "portatil", descricao: "Portátil", valor: 1200, entrega: "2027-01-10", conta: contaUmaVez(), estado: "devolvido",
    devolucao: "2028-01-10", estadoDevolucao: "bom", autor: "", ativoId: "at-1", ativo: comprado, ...p,
  });

  it("corrige só a que mudou e leva a ocupação (a linha)", () => {
    expect(correcaoDeDatas(linha(), "2027-01-12", "2028-01-10")).toEqual({
      correcao: { campos: ["entrega"], pessoaEquipamentoId: "pe-1", entrega: "2027-01-12" }, erro: null,
    });
    expect(correcaoDeDatas(linha(), "2027-01-10", "2028-02-01")).toEqual({
      correcao: { campos: ["devolucao"], pessoaEquipamentoId: "pe-1", devolucao: "2028-02-01" }, erro: null,
    });
  });

  it("sem mudanças não há nada a corrigir", () => {
    expect(correcaoDeDatas(linha(), "2027-01-10", "2028-01-10")).toEqual({ correcao: null, erro: "nada" });
  });

  it("a devolução não pode ser antes da entrega, e a entrega pede data", () => {
    expect(correcaoDeDatas(linha(), "2027-01-10", "2027-01-09").erro).toBe("devolucaoAntesEntrega");
    expect(correcaoDeDatas(linha(), "", "2028-01-10").erro).toBe("entrega");
    expect(correcaoDeDatas(linha(), "2027-01-10", "").erro).toBe("devolucao");
  });

  it("numa linha ainda atribuída só se corrige a entrega (a devolução é ignorada)", () => {
    const atribuida = linha({ estado: "atribuido", devolucao: null, estadoDevolucao: null });
    expect(correcaoDeDatas(atribuida, "2027-01-11", "")).toEqual({
      correcao: { campos: ["entrega"], pessoaEquipamentoId: "pe-1", entrega: "2027-01-11" }, erro: null,
    });
  });
});
