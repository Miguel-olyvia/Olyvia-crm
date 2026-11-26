import { describe, expect, it } from "vitest";
import { contaRepartida, contaTodosMeses, contaUmaVez } from "./comoConta";
import {
  situacaoDoEquipamento,
  validarDevolucao,
  validarEquipamento,
  equipamentosDoMes,
  validarNovoEquipamento,
  valorDoEquipamentoNoMes,
  type AtivoDoEquipamento,
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

// ---- Equipamento com ativo: o valor do mês vem do ativo (uma só fonte de verdade), nunca de `comoConta.ts` ----
const HOJE = "2030-06-15";
const PORTATIL_ATIVO: AtivoDoEquipamento = {
  forma: "comprado", codigo: "PC-0001", nome: "Portátil 14", tipo: "portatil", estado: "ativo", valorCompra: 1200, valorResidual: 0,
  dataCompra: "2027-01-05", vidaMeses: 36, vidaOrigem: "pagamento", desativadoEm: null,
};
const VIATURA_ATIVO: AtivoDoEquipamento = {
  forma: "alugado", codigo: "VIA-0001", nome: "Viatura de serviço", tipo: "viatura", estado: "ativo", rendaMensal: 450,
  inicioAluguer: "2026-01-01", fimAluguer: "2029-12-31", desativadoEm: null,
};
/** Uma linha do RH com ativo: a base já não guarda cópia do valor nem da conta; as chaves de compatibilidade (valor, conta) NÃO contam. */
const comAtivo = (ativo: AtivoDoEquipamento, parcial: Partial<EquipamentoPessoa> = {}): EquipamentoPessoa =>
  equipamento({ ativoId: "at-1", ativo, valor: 999, conta: contaUmaVez(), entrega: "2027-01-10", contaDesde: "2027-01-10", ...parcial });

describe("equipamento que é um ativo comprado: a quota de amortização, só de quem o tem no último dia do mês", () => {
  const ana = comAtivo(PORTATIL_ATIVO, { id: "ana", pessoaId: "p-ana", estado: "devolvido", devolucao: "2028-01-10", estadoDevolucao: "bom" });
  const bruno = comAtivo(PORTATIL_ATIVO, { id: "bruno", pessoaId: "p-bruno", entrega: "2028-03-15", contaDesde: "2028-03-15" });

  it("ignora a conta e o valor da linha: conta a quota do ativo (33,33), não os 999 € de uma vez", () => {
    expect(valorDoEquipamentoNoMes(ana, "2027-01", HOJE)).toBe(33.33);
    expect(valorDoEquipamentoNoMes(ana, "2027-02", HOJE)).toBe(33.33);
  });

  it("a Ana paga os 12 meses (399,96 €), os dois meses parados não são de ninguém e o Bruno paga os 22 seguintes (733,38 €)", () => {
    const meses = Array.from({ length: 36 }, (_, n) => `${2027 + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`);
    const soma = (e: EquipamentoPessoa) => Math.round(meses.reduce((s, m) => s + valorDoEquipamentoNoMes(e, m, HOJE), 0) * 100) / 100;
    expect(soma(ana)).toBe(399.96);
    expect(soma(bruno)).toBe(733.38);
    expect(meses.filter((m) => valorDoEquipamentoNoMes(ana, m, HOJE) === 0 && valorDoEquipamentoNoMes(bruno, m, HOJE) === 0)).toEqual(["2028-01", "2028-02"]);
    expect(valorDoEquipamentoNoMes(bruno, "2029-12", HOJE)).toBe(33.45);
  });

  it("só os equipamentos que contam no mês entram na lista do mês", () => {
    expect(equipamentosDoMes([ana, bruno], "2027-06", HOJE).map((e) => e.id)).toEqual(["ana"]);
    expect(equipamentosDoMes([ana, bruno], "2028-02", HOJE)).toEqual([]);
    expect(equipamentosDoMes([ana, bruno], "2028-03", HOJE).map((e) => e.id)).toEqual(["bruno"]);
  });

  it("situação do Bruno quando recebe: já amortizado 466,62 € (falta 733,38 € em 22 meses); a partir de março conta a quota dele", () => {
    expect(situacaoDoEquipamento(bruno, "2028-02", HOJE)).toMatchObject({ doMes: 0, contado: 0, mesesContados: 0, falta: 733.38, mesesFalta: 22, completo: false });
    expect(situacaoDoEquipamento(bruno, "2028-03", HOJE)).toMatchObject({ doMes: 33.33, contado: 33.33, mesesContados: 1, falta: 700.05, mesesFalta: 21 });
    expect(situacaoDoEquipamento(bruno, "2029-12", HOJE)).toMatchObject({ doMes: 33.45, contado: 733.38, mesesContados: 22, falta: 0, mesesFalta: 0, completo: true });
  });

  it("situação da Ana: antes de devolver falta o que o ativo ainda tem por amortizar; depois de devolver já contou 399,96 € e não falta nada a ela", () => {
    expect(situacaoDoEquipamento(ana, "2027-12", HOJE)).toMatchObject({ doMes: 33.33, contado: 399.96, mesesContados: 12, falta: 800.04, mesesFalta: 24 });
    expect(situacaoDoEquipamento(ana, "2028-01", HOJE)).toMatchObject({ doMes: 0, contado: 399.96, mesesContados: 12, falta: 0, mesesFalta: 0, completo: false });
  });

  it("ativo desativado: a quota pára no mês da desativação", () => {
    const parado = comAtivo({ ...PORTATIL_ATIVO, estado: "desativado", desativadoEm: "2027-06-20" });
    expect(valorDoEquipamentoNoMes(parado, "2027-06", HOJE)).toBe(33.33);
    expect(valorDoEquipamentoNoMes(parado, "2027-07", HOJE)).toBe(0);
  });
});

describe("equipamento que é um ativo alugado: a renda, uma só vez por mês", () => {
  const joao = comAtivo(VIATURA_ATIVO, { id: "joao", pessoaId: "p-joao", entrega: "2026-01-01", contaDesde: "2026-01-01", estado: "devolvido", devolucao: "2027-08-20", estadoDevolucao: "bom" });
  const ana = comAtivo(VIATURA_ATIVO, { id: "ana", pessoaId: "p-ana", entrega: "2027-08-25", contaDesde: "2027-08-25" });

  it("troca no mesmo mês (João devolve a 20/08, Ana recebe a 25/08): agosto são 450 € numa só pessoa, nunca 900 €", () => {
    expect(valorDoEquipamentoNoMes(joao, "2027-08", HOJE) + valorDoEquipamentoNoMes(ana, "2027-08", HOJE)).toBe(450);
    expect(valorDoEquipamentoNoMes(ana, "2027-08", HOJE)).toBe(450);
    expect(valorDoEquipamentoNoMes(joao, "2027-08", HOJE)).toBe(0);
    expect(valorDoEquipamentoNoMes(joao, "2027-07", HOJE)).toBe(450);
  });

  it("o dia da devolução conta: o João devolve a 31/08 e agosto é dele", () => {
    const devolveFimDoMes = { ...joao, devolucao: "2027-08-31" };
    const anaDia5 = { ...ana, entrega: "2027-09-05", contaDesde: "2027-09-05" };
    expect(valorDoEquipamentoNoMes(devolveFimDoMes, "2027-08", HOJE)).toBe(450);
    expect(valorDoEquipamentoNoMes(anaDia5, "2027-08", HOJE)).toBe(0);
    expect(valorDoEquipamentoNoMes(anaDia5, "2027-09", HOJE)).toBe(450);
  });

  it("entrega no próprio dia da devolução: a base manda conta_desde = dia seguinte e o mês continua a ser de quem devolve", () => {
    const devolve31 = { ...joao, devolucao: "2027-08-31" };
    const recebe31 = { ...ana, entrega: "2027-08-31", contaDesde: "2027-09-01" };
    expect(valorDoEquipamentoNoMes(devolve31, "2027-08", HOJE) + valorDoEquipamentoNoMes(recebe31, "2027-08", HOJE)).toBe(450);
    expect(valorDoEquipamentoNoMes(devolve31, "2027-08", HOJE)).toBe(450);
    expect(valorDoEquipamentoNoMes(recebe31, "2027-09", HOJE)).toBe(450);
  });

  it("sem fim de contrato continua; com fim, os meses depois do fim não têm renda", () => {
    const semFim = comAtivo({ ...VIATURA_ATIVO, fimAluguer: null }, { entrega: "2026-01-01", contaDesde: "2026-01-01" });
    expect(valorDoEquipamentoNoMes(semFim, "2040-01", HOJE)).toBe(450);
    expect(valorDoEquipamentoNoMes(ana, "2030-01", HOJE)).toBe(0);
  });

  it("situação: sem total (falta e meses por contar são nulos) e já contou as rendas do João", () => {
    expect(situacaoDoEquipamento(joao, "2027-07", HOJE)).toMatchObject({ doMes: 450, contado: 450 * 19, mesesContados: 19, falta: null, mesesFalta: null, completo: false });
    expect(situacaoDoEquipamento(joao, "2027-09", HOJE)).toMatchObject({ doMes: 0, contado: 450 * 19, falta: null });
  });
});

describe("a farda e as linhas sem ativo continuam como hoje", () => {
  it("sem ativo conta pelo «como conta» da linha, com ou sem as chaves novas", () => {
    const farda = equipamento({ tipo: "fardamento", valor: 80, entrega: "2026-09-02", conta: contaUmaVez(), ativoId: null, ativo: null, contaDesde: "2026-09-02" });
    expect(situacaoDoEquipamento(farda, "2026-09", HOJE)).toMatchObject({ doMes: 80, contado: 80, falta: 0, completo: true });
    expect(situacaoDoEquipamento(farda, "2026-10", HOJE).doMes).toBe(0);
    expect(situacaoDoEquipamento(equipamento(), "2026-01", HOJE)).toMatchObject({ doMes: 25, falta: 875 });
  });
});

describe("validarNovoEquipamento: comprado, alugado, já existe e farda", () => {
  const base = { pessoaId: "p1", entrega: "2027-01-10" };
  const comprado = { ...base, forma: "comprado" as const, tipo: "portatil" as const, descricao: "Portátil", valor: 1200, dataCompra: "2027-01-05", vidaMeses: 36, vidaOrigem: "pagamento" as const };
  const alugado = { ...base, forma: "alugado" as const, tipo: "viatura" as const, descricao: "Viatura", rendaMensal: 450, inicioAluguer: "2026-01-01", fimAluguer: "2029-12-31" };

  it("comprado válido; recusa sem pessoa, descrição, valor, data de entrega, vida fora de 1 a 600 e compra depois da entrega", () => {
    expect(validarNovoEquipamento(comprado)).toBeNull();
    expect(validarNovoEquipamento({ ...comprado, pessoaId: "" })).toBe("semPessoa");
    expect(validarNovoEquipamento({ ...comprado, descricao: " " })).toBe("semDescricao");
    expect(validarNovoEquipamento({ ...comprado, valor: 0 })).toBe("valorZero");
    expect(validarNovoEquipamento({ ...comprado, entrega: "" })).toBe("semData");
    expect(validarNovoEquipamento({ ...comprado, vidaMeses: 0 })).toBe("vidaInvalida");
    expect(validarNovoEquipamento({ ...comprado, vidaMeses: 601 })).toBe("vidaInvalida");
    expect(validarNovoEquipamento({ ...comprado, vidaMeses: 12.5 })).toBe("vidaInvalida");
    expect(validarNovoEquipamento({ ...comprado, vidaMeses: 600 })).toBeNull();
    expect(validarNovoEquipamento({ ...comprado, dataCompra: "2027-02-01" })).toBe("compraDepoisDaEntrega");
    expect(validarNovoEquipamento({ ...comprado, dataCompra: null })).toBeNull();
  });

  it("alugado válido; recusa sem renda, sem início, fim antes do início e entrega fora do contrato", () => {
    expect(validarNovoEquipamento(alugado)).toBeNull();
    expect(validarNovoEquipamento({ ...alugado, fimAluguer: null })).toBeNull();
    expect(validarNovoEquipamento({ ...alugado, rendaMensal: 0 })).toBe("rendaZero");
    expect(validarNovoEquipamento({ ...alugado, inicioAluguer: "" })).toBe("semInicioAluguer");
    expect(validarNovoEquipamento({ ...alugado, fimAluguer: "2025-12-31" })).toBe("fimAntesInicioAluguer");
    expect(validarNovoEquipamento({ ...alugado, entrega: "2025-12-31" })).toBe("entregaAntesDoInicio");
    expect(validarNovoEquipamento({ ...alugado, entrega: "2030-01-02" })).toBe("entregaDepoisDoFim");
  });

  it("um que já existe pede o ativo, a pessoa e a data de entrega", () => {
    const existente = { ...base, forma: "existente" as const, ativoId: "at-1" };
    expect(validarNovoEquipamento(existente)).toBeNull();
    expect(validarNovoEquipamento({ ...existente, ativoId: "" })).toBe("semAtivo");
    expect(validarNovoEquipamento({ ...existente, pessoaId: "" })).toBe("semPessoa");
    expect(validarNovoEquipamento({ ...existente, entrega: "" })).toBe("semData");
  });

  it("a farda (e a chamada antiga sem forma) valida como hoje, com o «como conta»", () => {
    const farda = { ...base, tipo: "fardamento" as const, descricao: "Colete", valor: 36, conta: contaRepartida(0) };
    expect(validarNovoEquipamento(farda)).toBe("mesesInvalidos");
    expect(validarNovoEquipamento({ ...farda, conta: contaUmaVez() })).toBeNull();
    expect(validarNovoEquipamento({ ...farda, forma: "farda", conta: contaUmaVez(), valor: 0 })).toBe("valorZero");
  });
});
