import { describe, expect, it } from "vitest";
import { seed } from "./motor";
import { clientesApp, leadsApp, todosApp } from "./pessoasDocs";
import { perfilDe } from "./perfilDocs";
import { contactoTexto, etapaTexto, negocioPorDefeito, posicaoTexto, valorColuna, vizinhasDe } from "./listaDocs";

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
  it("com um só negócio vem escolhido, para não haver espaço vazio", () => {
    expect(negocioPorDefeito(["n1"], null)).toBe("n1");
  });
  it("com vários, só fica escolhido o que a pessoa escolheu (e se ainda existe)", () => {
    expect(negocioPorDefeito(["n1", "n2"], null)).toBeNull();
    expect(negocioPorDefeito(["n1", "n2"], "n2")).toBe("n2");
    expect(negocioPorDefeito(["n1", "n2"], "n9")).toBeNull();
  });
  it("com um só, uma escolha que já não existe volta ao único; sem nenhum, nada", () => {
    expect(negocioPorDefeito(["n1"], "n9")).toBe("n1");
    expect(negocioPorDefeito([], null)).toBeNull();
  });
});
