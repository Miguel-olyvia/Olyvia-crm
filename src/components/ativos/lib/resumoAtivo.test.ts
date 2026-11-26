// A lógica do ecrã de ativos que não é desenho: os totais do separador, a etiqueta de estado de relance, a regra de depreciação em frase e
// a vida restante. Os totais usam a mesma conta do detalhe (`valorAtual`), por isso a soma das linhas bate sempre com o total.
import { describe, expect, it } from "vitest";
import type { Ativo, CatEquipamentoLigado } from "./tipos";
import { estadoDoAtivo, fraseDepreciacao, mesPt, motivoSemValor, totaisAtivos, vidaRestante } from "./resumoAtivo";
import { valorAtual } from "./valorAtivo";

const BASE: Ativo = {
  id: "a", grupo: "estrutura", tipo: "mobiliario", nome: "Mesa", codigo: null, numSerie: null, catEquipamentoId: null,
  dataCompra: "2026-01-15", valorCompra: 1200, valorResidual: 0, vidaMeses: 12, manutencaoAno: 0, centroCustoId: null,
  localizacao: null, notas: null, estado: "ativo", desativadoEm: null, desativadoMotivo: null, desativadoNota: null,
  catEquipamento: null, atribuicao: null, ligado: false, forma: "comprado", rendaMensal: null, inicioAluguer: null, fimAluguer: null, vidaOrigem: null, armazem: null, armazemLigado: false, ocupacoes: [],
};
const com = (p: Partial<Ativo>): Ativo => ({ ...BASE, ...p });
const CAT: CatEquipamentoLigado = { id: "c1", nome: "Berbequim", vidaAnos: 5, vidaHoras: null, usoAnoHoras: null };
const SERVICO = com({ grupo: "servico", tipo: null, vidaMeses: null, catEquipamentoId: "c1", catEquipamento: CAT, valorCompra: 640 });
const SO_HORAS = { ...CAT, id: "c2", vidaAnos: null, vidaHoras: 3000 };
const SEM_VIDA = { ...CAT, id: "c3", vidaAnos: null, vidaHoras: null };

describe("totaisAtivos", () => {
  it("conta os ativos em uso e soma a compra e o valor atual pela mesma conta do detalhe", () => {
    const lista = [com({ id: "1" }), com({ id: "2", valorCompra: 600, vidaMeses: 6 }), SERVICO];
    const t = totaisAtivos(lista, "2026-06");
    expect(t.quantidade).toBe(3);
    expect(t.valorCompra).toBe(1200 + 600 + 640);
    expect(t.valorAtual).toBe(valorAtual(lista[0], "2026-06")! + valorAtual(lista[1], "2026-06")! + valorAtual(lista[2], "2026-06")!);
    // 600 (mesa), 0 (6 meses, já depreciada) e 640 - 6 x 10,67 = 575,98 (a vida de 5 anos vem do modelo).
    expect(t.valorAtual).toBe(1175.98);
    expect(t.semValorAtual).toBe(0);
  });

  it("os desativados ficam de fora (não são «em uso»)", () => {
    const t = totaisAtivos([com({ id: "1" }), com({ id: "2", estado: "desativado", desativadoEm: "2026-03-01", desativadoMotivo: "vendido" })], "2026-06");
    expect(t.quantidade).toBe(1);
    expect(t.valorCompra).toBe(1200);
  });

  it("um ativo sem valor atual (só vida em horas) conta na quantidade e na compra, mas não no valor atual, e fica assinalado", () => {
    const porUso = com({ id: "3", grupo: "servico", tipo: null, vidaMeses: null, catEquipamentoId: "c2", catEquipamento: SO_HORAS, valorCompra: 890 });
    const t = totaisAtivos([com({ id: "1" }), porUso], "2026-06");
    expect(t).toMatchObject({ quantidade: 2, valorCompra: 2090, valorAtual: 600, semValorAtual: 1 });
  });

  it("lista vazia: zeros", () => {
    expect(totaisAtivos([], "2026-06")).toEqual({ quantidade: 0, comprados: 0, valorCompra: 0, amortizado: 0, valorAtual: 0, semValorAtual: 0, alugados: 0, rendaMensal: 0 });
  });

  it("o amortizado é a compra menos o valor atual de cada comprado (mesa de 1 200 € a 12 meses, 6 quotas = 600 €)", () => {
    const t = totaisAtivos([com({ id: "1" })], "2026-06");
    expect(t).toMatchObject({ valorCompra: 1200, amortizado: 600, valorAtual: 600 });
  });

  it("os alugados não entram na compra, no amortizado nem no valor atual: vão numa linha à parte (rendas por mês)", () => {
    const alugado = com({
      id: "r1", grupo: "pessoa", tipo: "viatura", forma: "alugado", dataCompra: null, valorCompra: null, vidaMeses: null,
      rendaMensal: 450, inicioAluguer: "2026-01-01", fimAluguer: null,
    });
    const t = totaisAtivos([com({ id: "1" }), alugado], "2026-06");
    expect(t).toMatchObject({ quantidade: 2, comprados: 1, valorCompra: 1200, valorAtual: 600, semValorAtual: 0, alugados: 1, rendaMensal: 450 });
  });

  it("um alugado cujo contrato já acabou ou ainda não começou não conta nas rendas do mês", () => {
    const acabou = com({ id: "r1", grupo: "pessoa", forma: "alugado", dataCompra: null, valorCompra: null, vidaMeses: null, rendaMensal: 300, inicioAluguer: "2025-01-01", fimAluguer: "2026-03-31" });
    const futuro = com({ id: "r2", grupo: "pessoa", forma: "alugado", dataCompra: null, valorCompra: null, vidaMeses: null, rendaMensal: 200, inicioAluguer: "2026-09-01", fimAluguer: null });
    const ativo = com({ id: "r3", grupo: "pessoa", forma: "alugado", dataCompra: null, valorCompra: null, vidaMeses: null, rendaMensal: 100, inicioAluguer: "2026-01-01", fimAluguer: "2026-12-31" });
    const t = totaisAtivos([acabou, futuro, ativo], "2026-06");
    expect(t).toMatchObject({ comprados: 0, alugados: 1, rendaMensal: 100, valorCompra: 0 });
  });

  it("os alugados desativados não contam", () => {
    const parado = com({
      id: "r1", grupo: "pessoa", forma: "alugado", dataCompra: null, valorCompra: null, vidaMeses: null, rendaMensal: 300, inicioAluguer: "2026-01-01",
      estado: "desativado", desativadoEm: "2026-03-01",
    });
    expect(totaisAtivos([parado], "2026-06")).toMatchObject({ quantidade: 0, alugados: 0, rendaMensal: 0 });
  });

  it("soma em cêntimos exatos (sem 0,1 + 0,2)", () => {
    const t = totaisAtivos([com({ id: "1", valorCompra: 0.1, vidaMeses: 1 }), com({ id: "2", valorCompra: 0.2, vidaMeses: 1 })], "2025-01");
    expect(t.valorCompra).toBe(0.3);
  });

  it("com vidas longas o total nunca fica abaixo da soma dos residuais (a mesma conta do detalhe)", () => {
    const lista = [com({ id: "1", valorCompra: 1000, vidaMeses: 600 }), com({ id: "2", valorCompra: 100, vidaMeses: 240 })];
    for (const mes of ["2026-06", "2046-01", "2075-12", "2076-01", "2090-01"]) expect(totaisAtivos(lista, mes).valorAtual).toBeGreaterThanOrEqual(0);
    expect(totaisAtivos(lista, "2090-01").valorAtual).toBe(0);
  });
});

describe("estadoDoAtivo (etiqueta de relance)", () => {
  it("ativo com tudo ligado: «Em uso»", () => {
    expect(estadoDoAtivo(com({}))).toEqual({ chave: "emUso", tom: "bom" });
  });
  it("desativado: «Desativado», em cinza", () => {
    expect(estadoDoAtivo(com({ estado: "desativado" }))).toEqual({ chave: "desativado", tom: "neutro" });
  });
  it("serviço sem equipamento do catálogo: «Sem equipamento ligado», em âmbar", () => {
    expect(estadoDoAtivo(com({ grupo: "servico", catEquipamentoId: null }))).toEqual({ chave: "semEquipamento", tom: "aviso" });
    expect(estadoDoAtivo(SERVICO).chave).toBe("emUso");
  });
  it("pessoa: a chave `ligado` da base decide (lê-se mesmo sem permissão do RH); sem ela, «Livre»", () => {
    const pessoa = com({ grupo: "pessoa", tipo: "portatil" });
    expect(estadoDoAtivo(pessoa)).toEqual({ chave: "semPessoa", tom: "neutro" });
    expect(estadoDoAtivo({ ...pessoa, ligado: true }).chave).toBe("emUso");
  });
  it("uma pessoa já apagada: ligado sem nome (atribuicao null) continua «Em uso», nunca «Livre»", () => {
    expect(estadoDoAtivo(com({ grupo: "pessoa", tipo: "portatil", ligado: true, atribuicao: null })).chave).toBe("emUso");
  });
  it("estrutura nunca fica «sem ligação»", () => {
    expect(estadoDoAtivo(com({ grupo: "estrutura" })).chave).toBe("emUso");
  });
  it("desativado ganha sobre a falta de ligação", () => {
    expect(estadoDoAtivo(com({ grupo: "servico", catEquipamentoId: null, estado: "desativado" })).chave).toBe("desativado");
  });
});

describe("fraseDepreciacao (a regra em frase simples)", () => {
  it("em curso: perde X por mês até MM/AAAA", () => {
    const f = fraseDepreciacao(com({ valorCompra: 640, vidaMeses: 60, dataCompra: "2025-03-10" }), "2026-06");
    expect(f).toEqual({ chave: "perdePorMes", valor: 10.67, fim: "02/2030" });
  });
  it("o fim é o último mês que conta (compra em jan com 12 meses acaba em dez do mesmo ano)", () => {
    expect(fraseDepreciacao(com({}), "2026-03")).toMatchObject({ chave: "perdePorMes", valor: 100, fim: "12/2026" });
  });
  it("residual igual à compra: «Não perde valor», nunca «Perde 0,00 €»", () => {
    expect(fraseDepreciacao(com({ valorResidual: 1200 }), "2026-03")).toEqual({ chave: "semPerda" });
  });
  it("uma quota que arredonda a zero: «perde menos de 0,01 €», nunca «Perde 0,00 €»", () => {
    expect(fraseDepreciacao(com({ valorCompra: 0.5, vidaMeses: 600 }), "2026-03")).toMatchObject({ chave: "perdePouco", fim: "12/2075" });
  });
  it("antes da compra: começa a depreciar em MM/AAAA", () => {
    expect(fraseDepreciacao(com({ dataCompra: "2026-09-01" }), "2026-06")).toEqual({ chave: "aindaNaoComeca", inicio: "09/2026" });
  });
  it("já completa: valor residual", () => {
    expect(fraseDepreciacao(com({ valorResidual: 200 }), "2027-06")).toEqual({ chave: "completa", valor: 200 });
  });
  it("só vida em horas: por uso; modelo sem vida nenhuma: sem vida definida", () => {
    expect(fraseDepreciacao(com({ vidaMeses: null, catEquipamento: SO_HORAS }), "2026-06")).toEqual({ chave: "porUso" });
    expect(fraseDepreciacao(com({ vidaMeses: null, catEquipamento: SEM_VIDA }), "2026-06")).toEqual({ chave: "semVida" });
    expect(fraseDepreciacao(com({ vidaMeses: null }), "2026-06")).toEqual({ chave: "semVida" });
  });
  it("desativado: deixou de depreciar nessa data e ficou a valer X", () => {
    const a = com({ estado: "desativado", desativadoEm: "2026-04-10", desativadoMotivo: "vendido" });
    expect(fraseDepreciacao(a, "2026-11")).toEqual({ chave: "desativada", fim: "04/2026", valor: 800 });
  });
});

describe("motivoSemValor: «por uso» só quando é mesmo por uso", () => {
  it("com vida em meses não há motivo", () => expect(motivoSemValor(com({}))).toBeNull());
  it("vida só em horas: por uso", () => expect(motivoSemValor(com({ vidaMeses: null, catEquipamento: SO_HORAS }))).toBe("porUso"));
  it("sem vida no modelo (ou sem modelo): sem vida definida", () => {
    expect(motivoSemValor(com({ vidaMeses: null, catEquipamento: SEM_VIDA }))).toBe("semVida");
    expect(motivoSemValor(com({ vidaMeses: null }))).toBe("semVida");
  });
});

describe("vidaRestante", () => {
  it("meses que faltam e o mês em que acaba (o da última quota)", () => {
    expect(vidaRestante(com({}), "2026-06")).toEqual({ meses: 6, fim: "12/2026", acabou: false });
    expect(vidaRestante(com({}), "2026-12")).toEqual({ meses: 0, fim: "12/2026", acabou: false });
  });
  it("já acabou", () => {
    expect(vidaRestante(com({}), "2027-03")).toEqual({ meses: 0, fim: "12/2026", acabou: true });
  });
  it("antes da compra: a vida toda", () => {
    expect(vidaRestante(com({ dataCompra: "2026-09-01" }), "2026-06")).toEqual({ meses: 12, fim: "08/2027", acabou: false });
  });
  it("sem vida em meses ou desativado: não se aplica", () => {
    expect(vidaRestante(com({ vidaMeses: null }), "2026-06")).toBeNull();
    expect(vidaRestante(com({ estado: "desativado", desativadoEm: "2026-04-10" }), "2026-06")).toBeNull();
  });
});

describe("mesPt", () => {
  it("AAAA-MM -> MM/AAAA", () => expect(mesPt("2030-03")).toBe("03/2030"));
});
