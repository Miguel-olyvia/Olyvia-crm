// A lógica do ecrã de ativos que não é desenho: os totais do separador, a etiqueta de estado de relance e a regra de depreciação em frase.
// Os totais usam a mesma conta do detalhe (`valorAtual`), por isso a soma das linhas bate sempre com o total.
import { describe, expect, it } from "vitest";
import type { Ativo, CatEquipamentoLigado } from "./tipos";
import { estadoDoAtivo, fraseDepreciacao, mesPt, totaisAtivos } from "./resumoAtivo";
import { valorAtual } from "./valorAtivo";

const BASE: Ativo = {
  id: "a", grupo: "estrutura", tipo: "mobiliario", nome: "Mesa", codigo: null, numSerie: null, catEquipamentoId: null,
  dataCompra: "2026-01-15", valorCompra: 1200, valorResidual: 0, vidaMeses: 12, manutencaoAno: 0, centroCustoId: null,
  localizacao: null, notas: null, estado: "ativo", desativadoEm: null, desativadoMotivo: null, desativadoNota: null,
  catEquipamento: null, atribuicao: null,
};
const com = (p: Partial<Ativo>): Ativo => ({ ...BASE, ...p });
const CAT: CatEquipamentoLigado = { id: "c1", nome: "Berbequim", vidaAnos: 5, vidaHoras: null, usoAnoHoras: null };
const SERVICO = com({ grupo: "servico", tipo: null, vidaMeses: null, catEquipamentoId: "c1", catEquipamento: CAT, valorCompra: 640 });

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

  it("um ativo «por uso» (sem vida em meses) conta na quantidade e na compra, mas não no valor atual, e fica assinalado", () => {
    const porUso = com({ id: "3", grupo: "servico", tipo: null, vidaMeses: null, catEquipamentoId: "c2", catEquipamento: { ...CAT, id: "c2", vidaAnos: null, vidaHoras: 3000 }, valorCompra: 890 });
    const t = totaisAtivos([com({ id: "1" }), porUso], "2026-06");
    expect(t).toMatchObject({ quantidade: 2, valorCompra: 2090, valorAtual: 600, semValorAtual: 1 });
  });

  it("lista vazia: zeros", () => {
    expect(totaisAtivos([], "2026-06")).toEqual({ quantidade: 0, valorCompra: 0, valorAtual: 0, semValorAtual: 0 });
  });

  it("soma em cêntimos exatos (sem 0,1 + 0,2)", () => {
    const t = totaisAtivos([com({ id: "1", valorCompra: 0.1, vidaMeses: 1 }), com({ id: "2", valorCompra: 0.2, vidaMeses: 1 })], "2025-01");
    expect(t.valorCompra).toBe(0.3);
  });
});

describe("estadoDoAtivo (etiqueta de relance)", () => {
  it("ativo com tudo ligado: «Em uso»", () => {
    expect(estadoDoAtivo(com({}), false)).toEqual({ chave: "emUso", tom: "bom" });
  });
  it("desativado: «Desativado», em cinza", () => {
    expect(estadoDoAtivo(com({ estado: "desativado" }), false)).toEqual({ chave: "desativado", tom: "neutro" });
  });
  it("serviço sem equipamento do catálogo: «Sem equipamento ligado», em âmbar", () => {
    expect(estadoDoAtivo(com({ grupo: "servico", catEquipamentoId: null }), false)).toEqual({ chave: "semEquipamento", tom: "aviso" });
    expect(estadoDoAtivo(SERVICO, false).chave).toBe("emUso");
  });
  it("pessoa sem atribuição: «Sem pessoa ligada»; com o RH oculto não se sabe, por isso «Em uso»", () => {
    const pessoa = com({ grupo: "pessoa", tipo: "portatil" });
    expect(estadoDoAtivo(pessoa, false)).toEqual({ chave: "semPessoa", tom: "aviso" });
    expect(estadoDoAtivo(pessoa, true).chave).toBe("emUso");
    expect(estadoDoAtivo({ ...pessoa, atribuicao: { pessoaEquipamentoId: "pe", pessoaNome: "Ana", entrega: null } }, false).chave).toBe("emUso");
  });
  it("estrutura nunca fica «sem ligação»", () => {
    expect(estadoDoAtivo(com({ grupo: "estrutura" }), false).chave).toBe("emUso");
  });
  it("desativado ganha sobre a falta de ligação", () => {
    expect(estadoDoAtivo(com({ grupo: "servico", catEquipamentoId: null, estado: "desativado" }), false).chave).toBe("desativado");
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
  it("antes da compra: começa a depreciar em MM/AAAA", () => {
    expect(fraseDepreciacao(com({ dataCompra: "2026-09-01" }), "2026-06")).toEqual({ chave: "aindaNaoComeca", inicio: "09/2026" });
  });
  it("já completa: valor residual", () => {
    expect(fraseDepreciacao(com({ valorResidual: 200 }), "2027-06")).toEqual({ chave: "completa", valor: 200 });
  });
  it("sem vida em meses: por uso, sem depreciação no tempo", () => {
    expect(fraseDepreciacao(com({ vidaMeses: null }), "2026-06")).toEqual({ chave: "porUso" });
  });
  it("desativado: deixou de depreciar nessa data e ficou a valer X", () => {
    const a = com({ estado: "desativado", desativadoEm: "2026-04-10", desativadoMotivo: "vendido" });
    expect(fraseDepreciacao(a, "2026-11")).toEqual({ chave: "desativada", fim: "04/2026", valor: 800 });
  });
});

describe("mesPt", () => {
  it("AAAA-MM -> MM/AAAA", () => expect(mesPt("2030-03")).toBe("03/2030"));
});
