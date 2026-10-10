import { describe, expect, it } from "vitest";
import { seed } from "./motor";
import { clientesApp, leadsApp, todosApp } from "./pessoasDocs";
import { perfilDe } from "./perfilDocs";
import { contactoTexto, etapaTexto, negocioMaisAvancado, negocioPorDefeito, posicaoTexto, valorColuna, vizinhasDe } from "./listaDocs";
import type { FaseNegocio } from "./negociosApp";

const NOMES = ["Ana", "Bruno", "Carla", "Duarte"];

describe("lista · a pessoa vizinha e a posição", () => {
  it("no meio há anterior e seguinte, e a posição conta a partir de 1", () => {
    expect(vizinhasDe(NOMES, "Bruno")).toEqual({ anterior: "Ana", seguinte: "Carla", posicao: 2, total: 4 });
  });
  it("na primeira não há anterior; na última não há seguinte (não dá a volta)", () => {
    expect(vizinhasDe(NOMES, "Ana")).toEqual({ anterior: null, seguinte: "Bruno", posicao: 1, total: 4 });
    expect(vizinhasDe(NOMES, "Duarte")).toEqual({ anterior: "Carla", seguinte: null, posicao: 4, total: 4 });
  });
  it("uma só pessoa na lista: sem vizinhas", () => {
    expect(vizinhasDe(["Ana"], "Ana")).toEqual({ anterior: null, seguinte: null, posicao: 1, total: 1 });
  });
  it("pessoa fora da lista (ou lista vazia): posição 0 e nenhuma vizinha", () => {
    expect(vizinhasDe(NOMES, "Zé")).toEqual({ anterior: null, seguinte: null, posicao: 0, total: 4 });
    expect(vizinhasDe([], "Ana")).toEqual({ anterior: null, seguinte: null, posicao: 0, total: 0 });
  });
  it("o texto da posição é '3 de 8', e vazio fora da lista", () => {
    expect(posicaoTexto(vizinhasDe(NOMES, "Carla"))).toBe("3 de 4");
    expect(posicaoTexto(vizinhasDe(NOMES, "Zé"))).toBe("");
  });
});

describe("lista · o último contacto em texto curto", () => {
  it("abaixo do limite diz há quanto tempo", () => {
    expect(contactoTexto({ diasSemContacto: 4, ultimoContacto: "06/10 10:00" })).toEqual({ texto: "há 4 dias", sem: false });
    expect(contactoTexto({ diasSemContacto: 1, ultimoContacto: "09/10 10:00" })).toEqual({ texto: "ontem", sem: false });
    expect(contactoTexto({ diasSemContacto: 0, ultimoContacto: "10/10 09:00" })).toEqual({ texto: "hoje", sem: false });
  });
  it("a partir de 7 dias diz 'sem contacto há N dias' e pede o alerta", () => {
    expect(contactoTexto({ diasSemContacto: 7, ultimoContacto: "03/10 10:00" })).toEqual({ texto: "sem contacto há 7 dias", sem: true });
    expect(contactoTexto({ diasSemContacto: 6, ultimoContacto: "04/10 10:00" }).sem).toBe(false);
    expect(contactoTexto({ diasSemContacto: 10, ultimoContacto: "30/09 10:00" }).texto).toBe("sem contacto há 10 dias");
  });
  it("com a seed, o Pedro Lopes tem 'há 4 dias' e a Ana Martins 'sem contacto há 10 dias'", () => {
    const S = seed(), p = (n: string) => todosApp(S).find((x) => x.nome === n)!;
    expect(contactoTexto(perfilDe(p("Pedro Lopes"), S)).texto).toBe("há 4 dias");
    expect(contactoTexto(perfilDe(p("Ana Martins"), S)).texto).toBe("sem contacto há 10 dias");
  });
});

describe("lista · etapa e valor por papel", () => {
  const S = seed();
  it("a lead diz a etapa do contacto (ou o estado do negócio); o cliente diz só Cliente", () => {
    expect(etapaTexto(leadsApp(S).find((p) => p.nome === "Pedro Lopes")!)).toBe("Por contactar");
    expect(etapaTexto(leadsApp(S).find((p) => p.nome === "Carla Nunes")!)).toBe("Negócio · proposta");
    expect(clientesApp(S).map(etapaTexto)).toEqual(["Cliente", "Cliente", "Cliente"]);
  });
  it("leads: o valor em orçamento, ou null quando não há (mostra-se '—')", () => {
    const v = Object.fromEntries(leadsApp(S).map((p) => [p.nome, valorColuna(S, p)]));
    expect(v["Pedro Lopes"]).toBeNull();
    // Carla (8.126,60 + 4.850 + 1.920 + 3.480 + 4.260) e Sérgio (3.306,22 + 1.380): os orçamentos de todos os negócios abertos.
    expect(Object.values(v).reduce<number>((a, x) => a + (x ?? 0), 0)).toBeCloseTo(8126.6 + 6770 + 7740 + 3306.22 + 1380, 2);
    expect(v["Rita Sousa"]).toBeNull(); // o WC social perdido não conta
  });
  it("clientes: o valor contratado", () => {
    // Os três contratos da seed (16.225,82) mais a venda direta aceite do Tiago (4.200 + 2.350); o resto está em curso, à espera de assinatura ou perdido.
    expect(clientesApp(S).reduce((a, p) => a + (valorColuna(S, p) ?? 0), 0)).toBeCloseTo(16225.82 + 6550, 2);
  });
});

describe("negócios · o escolhido por defeito", () => {
  const neg = (id: string, fase: FaseNegocio, perdido: string | null = null) => ({ id, fase, perdido });
  it("com um só negócio vem escolhido, ao lado ou por baixo, para não haver espaço vazio", () => {
    expect(negocioPorDefeito([neg("n1", "orcamento")], null)).toBe("n1");
    expect(negocioPorDefeito([neg("n1", "orcamento")], null, true)).toBe("n1");
  });
  it("com vários, ao lado abre o mais avançado em curso (Financeiro, Contrato, Proposta, Orçamento, Em preparação)", () => {
    const todos = [neg("a", "levantamento"), neg("b", "orcamento"), neg("c", "proposta"), neg("d", "contrato"), neg("e", "financeiro")];
    expect(negocioPorDefeito(todos, null)).toBe("e");
    expect(negocioPorDefeito(todos.slice(0, 4), null)).toBe("d");
    expect(negocioPorDefeito(todos.slice(0, 3), null)).toBe("c");
    expect(negocioPorDefeito(todos.slice(0, 2), null)).toBe("b");
  });
  it("os perdidos e os concluídos não contam enquanto houver um em curso", () => {
    expect(negocioPorDefeito([neg("p", "financeiro", "preço"), neg("o", "obra"), neg("c", "levantamento")], null)).toBe("c");
    expect(negocioPorDefeito([neg("p", "proposta", "adiou"), neg("b", "orcamento")], null)).toBe("b");
  });
  it("todos perdidos ou concluídos: o primeiro", () => {
    expect(negocioPorDefeito([neg("p1", "proposta", "preço"), neg("o", "obra"), neg("p2", "contrato", "adiou")], null)).toBe("p1");
    expect(negocioPorDefeito([neg("o", "obra"), neg("p", "proposta", "preço")], null)).toBe("o");
  });
  it("em empate ganha o primeiro da lista", () => {
    expect(negocioPorDefeito([neg("x", "proposta"), neg("y", "proposta"), neg("z", "orcamento")], null)).toBe("x");
    expect(negocioMaisAvancado([neg("x", "orcamento"), neg("y", "orcamento")])).toBe("x");
  });
  it("com o detalhe por baixo da lista não abre nenhum (um de cada vez, para não empurrar a lista)", () => {
    expect(negocioPorDefeito([neg("a", "proposta"), neg("b", "orcamento")], null, true)).toBeNull();
  });
  it("o que a pessoa escolheu ganha, se ainda existe, ao lado ou por baixo", () => {
    const dois = [neg("a", "financeiro"), neg("b", "orcamento")];
    expect(negocioPorDefeito(dois, "b")).toBe("b");
    expect(negocioPorDefeito(dois, "b", true)).toBe("b");
    expect(negocioPorDefeito(dois, "n9")).toBe("a");
    expect(negocioPorDefeito(dois, "n9", true)).toBeNull();
  });
  it("com um só, uma escolha que já não existe volta ao único; sem nenhum, nada", () => {
    expect(negocioPorDefeito([neg("n1", "orcamento")], "n9")).toBe("n1");
    expect(negocioPorDefeito([], null)).toBeNull();
    expect(negocioMaisAvancado([])).toBeNull();
  });
});
