// A amortização que se vê ao abrir um ativo, e quem paga cada mês (pessoa ou estrutura): funções puras, sem ecrã. Os exemplos são os do
// desenho v4 (secção 2): o portátil de 1 200 € a 36 meses que passa da Ana para a estrutura e para o Bruno, e a viatura em renting.
import { describe, expect, it } from "vitest";
import {
  avisosDoAtivo, contaDoAtivo, custoParadoDosAtivos, custoParadoNoMes, fimDaAmortizacao, ocupacaoParaConta, repartoDoAtivo, resumoAmortizacao,
} from "./amortizacaoAtivo";
import type { AtivoAlugadoConta, AtivoCompradoConta, OcupacaoParaConta } from "./contaAtivo";
import type { Ativo, OcupacaoDoAtivo } from "./tipos";

const HOJE = "2030-06-15";

const portatil: AtivoCompradoConta = { forma: "comprado", valorCompra: 1200, valorResidual: 0, dataCompra: "2027-01-05", vidaMeses: 36, desativadoEm: null };
const viatura: AtivoAlugadoConta = { forma: "alugado", rendaMensal: 450, inicioAluguer: "2026-01-01", fimAluguer: "2029-12-31", desativadoEm: null };

const oc = (contaDesde: string, devolucao: string | null): OcupacaoParaConta => ({ contaDesde, devolucao });

describe("fimDaAmortizacao", () => {
  it("é o mês da última quota: compra em janeiro de 2027 com 36 meses acaba em dezembro de 2029", () => {
    expect(fimDaAmortizacao(portatil)).toBe("2029-12");
    expect(fimDaAmortizacao({ ...portatil, vidaMeses: 1 })).toBe("2027-01");
  });

  it("desativado a meio, acaba no mês da desativação", () => {
    expect(fimDaAmortizacao({ ...portatil, desativadoEm: "2027-06-20" })).toBe("2027-06");
  });

  it("desativado depois do fim da vida, mantém o fim da vida", () => {
    expect(fimDaAmortizacao({ ...portatil, desativadoEm: "2031-01-02" })).toBe("2029-12");
  });

  it("sem vida em meses não há fim", () => {
    expect(fimDaAmortizacao({ ...portatil, vidaMeses: null })).toBeNull();
  });
});

describe("resumoAmortizacao (o que se vê ao abrir o ativo)", () => {
  it("14 meses de 36: amortizado 466,62 € (38,9%), valor atual 733,38 €, faltam 22 meses", () => {
    const r = resumoAmortizacao(portatil, "2028-02")!;
    expect(r.valorCompra).toBe(1200);
    expect(r.amortizado).toBe(466.62);
    expect(r.percentagem).toBe(38.9);
    expect(r.valorAtual).toBe(733.38);
    expect(r.mesesDecorridos).toBe(14);
    expect(r.mesesTotais).toBe(36);
    expect(r.fim).toBe("2029-12");
    expect(r.concluida).toBe(false);
  });

  it("antes da compra: 0 € e 0%, o valor atual é o da compra", () => {
    const r = resumoAmortizacao(portatil, "2026-06")!;
    expect(r.amortizado).toBe(0);
    expect(r.percentagem).toBe(0);
    expect(r.valorAtual).toBe(1200);
    expect(r.mesesDecorridos).toBe(0);
  });

  it("no fim da vida: 100%, valor atual igual ao residual e concluída", () => {
    const r = resumoAmortizacao({ ...portatil, valorResidual: 200 }, "2030-06")!;
    expect(r.amortizado).toBe(1000);
    expect(r.percentagem).toBe(100);
    expect(r.valorAtual).toBe(200);
    expect(r.mesesDecorridos).toBe(36);
    expect(r.concluida).toBe(true);
  });

  it("residual igual à compra: nada a amortizar, nunca divide por zero", () => {
    const r = resumoAmortizacao({ ...portatil, valorResidual: 1200 }, "2028-02")!;
    expect(r.amortizado).toBe(0);
    expect(r.percentagem).toBe(0);
  });

  it("desativado: os meses totais são os que chegou a amortizar", () => {
    const r = resumoAmortizacao({ ...portatil, desativadoEm: "2027-06-20" }, "2030-01")!;
    expect(r.mesesDecorridos).toBe(6);
    expect(r.mesesTotais).toBe(6);
    expect(r.amortizado).toBe(199.98);
  });

  it("sem vida em meses não há resumo", () => {
    expect(resumoAmortizacao({ ...portatil, vidaMeses: null }, "2028-02")).toBeNull();
  });
});

describe("repartoDoAtivo: de quem é cada mês", () => {
  // Ana de 10/01/2027 a 10/01/2028; o Bruno recebe a 15/03/2028 e fica com ele.
  const ana = oc("2027-01-10", "2028-01-10");
  const bruno = oc("2028-03-15", null);

  it("portátil: Ana 399,96 € em 12 meses, estrutura 66,66 € em 2 meses e Bruno 733,38 € em 22 meses (total 1 200 €)", () => {
    const r = repartoDoAtivo(portatil, [ana, bruno], "2029-12", HOJE);
    expect(r.pessoas[0]).toEqual({ valor: 399.96, meses: 12 });
    expect(r.estrutura).toEqual({ valor: 66.66, meses: 2 });
    expect(r.pessoas[1]).toEqual({ valor: 733.38, meses: 22 });
    expect(r.total).toEqual({ valor: 1200, meses: 36 });
  });

  it("só até hoje: pára no mês pedido (o Bruno só leva os meses até lá)", () => {
    const r = repartoDoAtivo(portatil, [ana, bruno], "2028-05", HOJE);
    expect(r.pessoas[0]).toEqual({ valor: 399.96, meses: 12 });
    expect(r.estrutura.meses).toBe(2);
    expect(r.pessoas[1].meses).toBe(3);
    expect(r.total.meses).toBe(17);
  });

  it("antes da compra não há nada", () => {
    const r = repartoDoAtivo(portatil, [ana, bruno], "2026-12", HOJE);
    expect(r.total).toEqual({ valor: 0, meses: 0 });
  });

  it("sem nenhuma ocupação tudo é da estrutura", () => {
    const r = repartoDoAtivo(portatil, [], "2029-12", HOJE);
    expect(r.pessoas).toEqual([]);
    expect(r.estrutura).toEqual({ valor: 1200, meses: 36 });
  });

  it("viatura em renting: João 9 000 € (20 meses) e Ana 12 600 € (28 meses), estrutura 0", () => {
    const joao = oc("2026-01-01", "2027-08-31");
    const anaV = oc("2027-09-05", "2029-12-31");
    const r = repartoDoAtivo(viatura, [joao, anaV], "2029-12", HOJE);
    expect(r.pessoas[0]).toEqual({ valor: 9000, meses: 20 });
    expect(r.pessoas[1]).toEqual({ valor: 12600, meses: 28 });
    expect(r.estrutura).toEqual({ valor: 0, meses: 0 });
    expect(r.total).toEqual({ valor: 21600, meses: 48 });
  });

  it("a Ana só a recebe a 01/10: setembro vai para a estrutura (450 €)", () => {
    const joao = oc("2026-01-01", "2027-08-31");
    const anaV = oc("2027-10-01", "2029-12-31");
    const r = repartoDoAtivo(viatura, [joao, anaV], "2029-12", HOJE);
    expect(r.estrutura).toEqual({ valor: 450, meses: 1 });
    expect(r.pessoas[0].meses).toBe(20);
    expect(r.pessoas[1].meses).toBe(27);
    expect(r.total.valor).toBe(21600);
  });

  it("troca no mesmo dia (devolve a 31/08, a Ana recebe a 31/08): agosto é de quem devolve; a base manda conta_desde = dia seguinte", () => {
    const joao = oc("2026-01-01", "2027-08-31");
    const anaV = oc("2027-09-01", "2029-12-31");
    const r = repartoDoAtivo(viatura, [joao, anaV], "2029-12", HOJE);
    expect(r.pessoas[0]).toEqual({ valor: 9000, meses: 20 });
    expect(r.pessoas[1].meses).toBe(28);
  });

  it("troca no mesmo mês (João devolve a 20/08, Ana recebe a 25/08): agosto é só da Ana, nunca 900 €", () => {
    const joao = oc("2026-01-01", "2027-08-20");
    const anaV = oc("2027-08-25", "2029-12-31");
    const r = repartoDoAtivo(viatura, [joao, anaV], "2029-12", HOJE);
    expect(r.pessoas[0].meses).toBe(19);
    expect(r.pessoas[1].meses).toBe(29);
    expect(r.total).toEqual({ valor: 21600, meses: 48 });
  });

  it("devolvido a 20/08 e ninguém o tem a 31/08: agosto vai para a estrutura", () => {
    const joao = oc("2026-01-01", "2027-08-20");
    const r = repartoDoAtivo(viatura, [joao], "2027-09", HOJE);
    expect(r.estrutura).toEqual({ valor: 900, meses: 2 });
    expect(r.pessoas[0].meses).toBe(19);
  });

  it("aluguer sem fim, até ao mês pedido: conta só até lá", () => {
    const semFim: AtivoAlugadoConta = { ...viatura, fimAluguer: null };
    const r = repartoDoAtivo(semFim, [oc("2026-03-10", null)], "2026-06", "2026-06-15");
    expect(r.pessoas[0]).toEqual({ valor: 1800, meses: 4 });
    expect(r.estrutura).toEqual({ valor: 900, meses: 2 });
  });

  it("aluguer desativado a meio: a renda pára no mês da desativação", () => {
    const parado: AtivoAlugadoConta = { ...viatura, desativadoEm: "2026-03-20" };
    const r = repartoDoAtivo(parado, [], "2029-12", HOJE);
    expect(r.total).toEqual({ valor: 1350, meses: 3 });
  });

  it("devolução depois do fim do contrato: não há renda depois do fim", () => {
    const joao = oc("2026-01-01", "2030-02-10");
    const r = repartoDoAtivo(viatura, [joao], "2030-03", HOJE);
    expect(r.total.meses).toBe(48);
  });
});

describe("custoParadoNoMes (a estrutura, somando os equipamentos sem pessoa)", () => {
  it("soma o que ninguém tem a 31 do mês e ignora o que alguém tem", () => {
    const parado = { conta: portatil, ocupacoes: [oc("2027-01-10", "2028-01-10")] };
    const comPessoa = { conta: viatura, ocupacoes: [oc("2026-01-01", null)] };
    expect(custoParadoNoMes([parado, comPessoa], "2028-02", HOJE)).toBe(33.33);
    expect(custoParadoNoMes([parado, comPessoa], "2027-06", HOJE)).toBe(0);
  });

  it("sem equipamentos não há custo", () => {
    expect(custoParadoNoMes([], "2028-02", HOJE)).toBe(0);
  });
});

const ativoBase: Ativo = {
  id: "a", grupo: "pessoa", tipo: "viatura", nome: "Carrinha", codigo: "VIA-0001", numSerie: null, catEquipamentoId: null,
  dataCompra: null, valorCompra: null, valorResidual: 0, vidaMeses: null, manutencaoAno: 0, centroCustoId: null, localizacao: null, notas: null,
  estado: "ativo", desativadoEm: null, desativadoMotivo: null, desativadoNota: null, catEquipamento: null, atribuicao: null, ligado: false,
  forma: "alugado", rendaMensal: 450, inicioAluguer: "2026-01-01", fimAluguer: null, vidaOrigem: null, armazem: null, armazemLigado: false, ocupacoes: [],
};
const ocupacao = (parcial: Partial<OcupacaoDoAtivo>): OcupacaoDoAtivo => ({
  pessoaEquipamentoId: "o1", pessoaId: null, pessoaNome: null, estado: null, entrega: "2026-02-01", devolucao: null, contaDesde: "2026-02-01", ...parcial,
});

describe("contaDoAtivo e ocupacaoParaConta", () => {
  it("um comprado usa a vida do modelo quando o ativo não tem vida própria (serviço)", () => {
    const servico: Ativo = {
      ...ativoBase, grupo: "servico", tipo: null, forma: "comprado", rendaMensal: null, inicioAluguer: null, dataCompra: "2027-01-05", valorCompra: 600,
      vidaMeses: null, catEquipamento: { id: "c", nome: "B", vidaAnos: 5, vidaHoras: null, usoAnoHoras: null },
    };
    expect(contaDoAtivo(servico)).toMatchObject({ forma: "comprado", vidaMeses: 60, valorCompra: 600 });
  });

  it("um alugado leva a renda e as datas", () => {
    expect(contaDoAtivo(ativoBase)).toEqual({ forma: "alugado", rendaMensal: 450, inicioAluguer: "2026-01-01", fimAluguer: null, desativadoEm: null });
  });

  it("sem os dados da conta (comprado sem data, alugado sem renda) não há conta", () => {
    expect(contaDoAtivo({ ...ativoBase, forma: "comprado", valorCompra: null })).toBeNull();
    expect(contaDoAtivo({ ...ativoBase, rendaMensal: null })).toBeNull();
  });

  it("a ocupação usa conta_desde; sem ele, a entrega", () => {
    expect(ocupacaoParaConta(ocupacao({ entrega: "2027-08-31", contaDesde: "2027-09-01", devolucao: "2028-01-01" }))).toEqual({ contaDesde: "2027-09-01", devolucao: "2028-01-01" });
    expect(ocupacaoParaConta(ocupacao({ entrega: "2027-08-31", contaDesde: null }))).toEqual({ contaDesde: "2027-08-31", devolucao: null });
  });
});

describe("avisosDoAtivo", () => {
  it("alugado sem fim, já devolvido e nunca desativado: avisa que a renda continua a contar", () => {
    const a: Ativo = { ...ativoBase, ocupacoes: [ocupacao({ devolucao: "2026-09-01" })] };
    expect(avisosDoAtivo(a, "2027-01-10")).toEqual(["alugadoSemFimDevolvido"]);
  });

  it("alugado sem fim com o equipamento ainda entregue: sem aviso", () => {
    const a: Ativo = { ...ativoBase, ocupacoes: [ocupacao({})] };
    expect(avisosDoAtivo(a, "2027-01-10")).toEqual([]);
  });

  it("alugado sem fim que nunca foi entregue: sem aviso (ainda não foi usado)", () => {
    expect(avisosDoAtivo(ativoBase, "2027-01-10")).toEqual([]);
  });

  it("já desativado: sem aviso", () => {
    const a: Ativo = { ...ativoBase, estado: "desativado", desativadoEm: "2026-10-01", ocupacoes: [ocupacao({ devolucao: "2026-09-01" })] };
    expect(avisosDoAtivo(a, "2027-01-10")).toEqual([]);
  });

  it("contrato terminado com o equipamento ainda entregue", () => {
    const a: Ativo = { ...ativoBase, fimAluguer: "2026-12-31", ocupacoes: [ocupacao({})] };
    expect(avisosDoAtivo(a, "2027-01-10")).toEqual(["aluguerTerminadoEntregue"]);
    expect(avisosDoAtivo(a, "2026-12-31")).toEqual([]);
  });

  it("um comprado nunca tem estes avisos", () => {
    const a: Ativo = { ...ativoBase, forma: "comprado", rendaMensal: null, inicioAluguer: null, dataCompra: "2026-01-01", valorCompra: 100, vidaMeses: 12, ocupacoes: [ocupacao({ devolucao: "2026-09-01" })] };
    expect(avisosDoAtivo(a, "2027-01-10")).toEqual([]);
  });
});

describe("custoParadoDosAtivos (o que o separador Estrutura mostra de equipamentos sem pessoa)", () => {
  const comprado = (parcial: Partial<Ativo>): Ativo => ({
    ...ativoBase, forma: "comprado", rendaMensal: null, inicioAluguer: null, dataCompra: "2027-01-05", valorCompra: 1200, vidaMeses: 36, ...parcial,
  });

  it("soma o que ninguém tem no mês: o portátil devolvido (33,33 €) e a renda de uma viatura ainda por entregar (450 €)", () => {
    const devolvido = comprado({ id: "1", ocupacoes: [ocupacao({ contaDesde: "2027-01-10", devolucao: "2028-01-10" })] });
    const porEntregar = { ...ativoBase, id: "2", ocupacoes: [] };
    const comPessoa = { ...ativoBase, id: "3", ocupacoes: [ocupacao({ contaDesde: "2026-01-01" })] };
    expect(custoParadoDosAtivos([devolvido, porEntregar, comPessoa], "2028-02", HOJE)).toBe(483.33);
  });

  it("os desativados e os que não têm conta legível ficam de fora", () => {
    const desativado = { ...ativoBase, id: "1", estado: "desativado" as const, desativadoEm: "2027-01-01", ocupacoes: [] };
    const semRenda = { ...ativoBase, id: "2", rendaMensal: null };
    expect(custoParadoDosAtivos([desativado, semRenda], "2028-02", HOJE)).toBe(0);
  });
});
