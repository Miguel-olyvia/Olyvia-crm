// O modelo certo: um NEGÓCIO tem fases e UM OU MAIS orçamentos, que no fim geram UMA proposta (e, se exigido, um contrato).
// Estes testes fixam a função única de negócios por pessoa (seed mais exemplos) e a matriz de exemplos que mostra o que é possível.
import { describe, expect, it } from "vitest";
import { seed, type Estado } from "./motor";
import { EXEMPLOS } from "./exemplosDocs";
import { documentosDoNegocio, negociosDe, resumoDoc, textoOrcamentos, valorNegocio, type NegocioApp } from "./negociosApp";
import { COLUNAS_V2, cartoesV2, negociosPorPessoa } from "./negociosDocs";
import { clientesApp, documentosDe, ehGanho, leadsApp, todosApp } from "./pessoasDocs";
import { leadsDe } from "./leadsDocs";
import { estadoDe, percursoDe } from "./perfilDocs";

const NOMES = ["Ana Martins", "Pedro Lopes", "Rita Sousa", "Manuel Costa", "Luísa Freitas", "Hugo Matos", "Carla Nunes", "Sérgio Pinto", "Tiago Almeida", "Marta Lima", "Joana Ribeiro"];
const todos = (S: Estado): NegocioApp[] => NOMES.flatMap((n) => negociosDe(S, n));
const de = (S: Estado, nome: string, titulo: string): NegocioApp => negociosDe(S, nome).find((n) => n.titulo === titulo)!;
const coluna = (S: Estado, nome: string, titulo: string): string | undefined => cartoesV2(S).find((c) => c.nome === nome && c.titulo === titulo)?.doc;

describe("negociosDe · a função única de negócios por pessoa", () => {
  it("o negócio da seed vem primeiro, mapeado para a mesma forma, e é o próprio negócio do Estado", () => {
    const S = seed();
    const [n1, ...resto] = negociosDe(S, "Carla Nunes");
    expect(n1).toMatchObject({ id: "neg-1031", negocioId: 1031, titulo: "Cozinha", fase: "proposta", proposta: "enviada", demo: false, perdido: null });
    expect(n1.deal).toBe(S.deals.find((d) => d.id === 1031));
    expect(n1.orcamentos).toHaveLength(1);
    expect(n1.orcamentos[0].valor).toBeCloseTo(8126.6, 2);
    expect(resto.every((n) => n.demo)).toBe(true);
  });
  it("tem um negócio por item, e quem não tem exemplos só tem o da seed", () => {
    const S = seed();
    const por = (nome: string): number => negociosDe(S, nome).length;
    expect(["Carla Nunes", "Sérgio Pinto", "Tiago Almeida", "Joana Ribeiro", "Marta Lima", "Rita Sousa"].map(por)).toEqual([3, 2, 3, 2, 3, 2]);
    for (const nome of ["Ana Martins", "Pedro Lopes", "Manuel Costa", "Luísa Freitas", "Hugo Matos"]) expect(por(nome), nome).toBe(1);
    expect(negociosDe(S, "Ninguém")).toEqual([]);
  });
  it("sem negócio aberto na seed não há exemplos (não há a que ligá-los)", () => {
    const S = seed();
    S.deals.find((d) => d.id === 1022)!.perdido = true;
    expect(negociosDe(S, "Marta Lima")).toEqual([]);
    const T = seed();
    T.deals = T.deals.filter((d) => d.id !== 1031);
    expect(negociosDe(T, "Carla Nunes")).toEqual([]);
  });
  it("os exemplos abrem o negócio base da mesma pessoa e o motor vê-os como negócios dela", () => {
    const S = seed();
    for (const n of todos(S)) {
      const base = S.deals.find((d) => d.id === n.negocioId)!;
      expect(base.nome, n.id).toBe(n.nome);
      expect(n.deal.nome, n.id).toBe(n.nome);
    }
  });
  it("ids únicos, e os dos exemplos não colidem com os da seed nem com S.seq", () => {
    const S = seed();
    const ns = todos(S);
    expect(new Set(ns.map((n) => n.id)).size).toBe(ns.length);
    expect(new Set(ns.map((n) => n.deal.id)).size).toBe(ns.length);
    const reais = new Set(S.deals.map((d) => d.id));
    for (const n of ns.filter((x) => x.demo)) {
      expect(reais.has(n.deal.id), n.id).toBe(false);
      expect(n.deal.id, n.id).toBeGreaterThan(S.seq + 1000);
    }
    expect(todos(S).map((n) => n.id)).toEqual(ns.map((n) => n.id));
  });
  it("tudo o que não é da seed está marcado demo, e nenhum da seed está", () => {
    const S = seed();
    const exemplos = Object.values(EXEMPLOS).flat().length;
    expect(todos(S).filter((n) => n.demo)).toHaveLength(exemplos);
    expect(todos(S).filter((n) => !n.demo).every((n) => n.id === `neg-${n.deal.id}`)).toBe(true);
  });
  it("nada muda o Estado nem o negócio base", () => {
    const S = seed();
    const antes = JSON.stringify(S);
    for (const n of todos(S)) { documentosDoNegocio(n); valorNegocio(n); textoOrcamentos(n); estadoDe(n); percursoDe(n.deal); }
    cartoesV2(S); documentosDe(todosApp(S)[0]);
    expect(JSON.stringify(S)).toBe(antes);
  });
});

describe("matriz de exemplos · o negócio e os seus orçamentos", () => {
  const S = seed();
  it("o valor do negócio é a soma dos orçamentos, e a proposta inclui todos", () => {
    for (const n of todos(S).filter((x) => x.orcamentos.length)) {
      const soma = n.orcamentos.reduce((a, o) => a + o.valor, 0);
      expect(valorNegocio(n), n.id).toBeCloseTo(soma, 2);
      const proposta = documentosDoNegocio(n).find((d) => d.tipo === "Proposta")!;
      expect(proposta.inclui, n.id).toBe(n.orcamentos.length);
      expect(proposta.valor, n.id).toBeCloseTo(soma, 2);
      expect(documentosDoNegocio(n).filter((d) => d.tipo === "Orçamento"), n.id).toHaveLength(n.orcamentos.length);
    }
  });
  it("sem orçamentos não há valor nem documentos (a lead ainda em preparação)", () => {
    const rita = negociosDe(S, "Rita Sousa")[0];
    expect(rita.orcamentos).toEqual([]);
    expect(valorNegocio(rita)).toBeNull();
    expect(documentosDoNegocio(rita)).toEqual([]);
  });
  it("o contrato só existe nos negócios que o exigem e com a proposta aceite; a venda direta não tem", () => {
    for (const n of todos(S)) {
      const contrato = documentosDoNegocio(n).some((d) => d.tipo === "Contrato");
      expect(contrato, n.id).toBe(n.contrato !== null && n.proposta === "aceite");
      expect(n.vendaDireta, n.id).toBe(n.contrato === null);
    }
  });
  it("a venda direta tem quatro passos e o negócio com contrato cinco", () => {
    expect(percursoDe(de(S, "Tiago Almeida", "Climatização e isolamento").deal)).toHaveLength(4);
    expect(percursoDe(de(S, "Carla Nunes", "Varanda fechada").deal)).toHaveLength(4);
    expect(percursoDe(de(S, "Joana Ribeiro", "WC de serviço e lavandaria").deal)).toHaveLength(5);
  });
  it("a proposta diz quantos orçamentos inclui: 'inclui 2 orçamentos' e, com um só, 'inclui 1 orçamento'", () => {
    const proposta = (n: NegocioApp) => resumoDoc(documentosDoNegocio(n).find((d) => d.tipo === "Proposta")!);
    expect(proposta(de(S, "Carla Nunes", "Varanda fechada"))).toBe("Enviada · inclui 2 orçamentos · 7.740,00 € · 08/10");
    expect(proposta(de(S, "Carla Nunes", "Cozinha"))).toMatch(/^Enviada · inclui 1 orçamento · /);
    const orcamento = documentosDoNegocio(de(S, "Carla Nunes", "Varanda fechada")).find((d) => d.tipo === "Orçamento")!;
    expect(resumoDoc(orcamento)).not.toMatch(/inclui/);
  });
  it("as datas dos exemplos são as de cada um, coerentes com o estado e com hoje (10/10)", () => {
    const dia = (s: string): number => { const [d, m] = s.split("/").map(Number); return m * 100 + d; };
    for (const ex of Object.values(EXEMPLOS).flat()) {
      const { quando, enviada, aceite, proposta } = ex;
      expect(!!enviada, `${ex.id} enviada`).toBe(proposta !== "por gerar");
      expect(!!aceite, `${ex.id} aceite`).toBe(proposta === "aceite");
      if (enviada) expect(dia(enviada), `${ex.id} enviada >= entrada`).toBeGreaterThanOrEqual(dia(quando));
      if (enviada && aceite) expect(dia(aceite), `${ex.id} aceite >= enviada`).toBeGreaterThanOrEqual(dia(enviada));
      expect(dia(aceite ?? enviada ?? quando), `${ex.id} não é depois de hoje`).toBeLessThanOrEqual(dia("10/10"));
    }
    const tiago = de(S, "Tiago Almeida", "Climatização e isolamento").deal.orc!;
    expect([tiago.enviada, tiago.aceite]).toEqual(["05/10", "08/10"]);
    const joana = de(S, "Joana Ribeiro", "WC de serviço e lavandaria");
    expect(joana.deal.orc!.aceite).toBe("09/10");
    // Sem histórico no exemplo, a data do contrato é a da proposta aceite.
    expect(documentosDoNegocio(joana).find((d) => d.tipo === "Contrato")!.data).toBe("09/10");
  });
  it("um negócio perdido tem motivo e nunca está ganho, nem entra nas colunas", () => {
    const perdidos = todos(S).filter((n) => n.perdido !== null);
    expect(perdidos.map((n) => [n.nome, n.titulo, n.perdido])).toEqual([["Rita Sousa", "WC social", "adiou"], ["Marta Lima", "Pavimento exterior", "preço"]]);
    for (const n of perdidos) { expect(estadoDe(n)).toBe("Perdido"); expect(n.deal.perdido).toBe(true); expect(cartoesV2(S).some((c) => c.id === n.id)).toBe(false); }
  });
});

describe("matriz de exemplos · cobertura da V2", () => {
  const S = seed();
  const cs = cartoesV2(S);
  const ids = (doc: string) => cs.filter((c) => c.doc === doc);
  it("cada coluna tem pelo menos um cartão", () => {
    for (const { id } of COLUNAS_V2) expect(ids(id).length, id).toBeGreaterThanOrEqual(1);
  });
  it("há negócios de um orçamento em Orçamento e em Proposta, e de vários em Orçamento, Proposta, Contrato e Financeiro", () => {
    expect(ids("orcamento").some((c) => c.orcamentos === 1)).toBe(true);
    expect(ids("proposta").some((c) => c.orcamentos === 1)).toBe(true);
    for (const { id } of COLUNAS_V2) expect(ids(id).some((c) => c.orcamentos >= 2), id).toBe(true);
  });
  it("as colunas certas, negócio a negócio", () => {
    const esperado: [string, string, string][] = [
      ["Carla Nunes", "Cozinha", "proposta"], ["Carla Nunes", "Casa de banho e pintura", "orcamento"], ["Carla Nunes", "Varanda fechada", "proposta"],
      ["Sérgio Pinto", "WC", "proposta"], ["Sérgio Pinto", "Pintura interior", "orcamento"],
      ["Tiago Almeida", "Cozinha", "financeiro"], ["Tiago Almeida", "Climatização e isolamento", "financeiro"], ["Tiago Almeida", "Pintura exterior", "orcamento"],
      ["Joana Ribeiro", "WC de serviço e lavandaria", "contrato"], ["Marta Lima", "Cozinha nova", "orcamento"],
    ];
    for (const [nome, titulo, doc] of esperado) expect(coluna(S, nome, titulo), `${nome} · ${titulo}`).toBe(doc);
    for (const [nome, titulo] of [["Marta Lima", "Pavimento exterior"], ["Rita Sousa", "WC social"], ["Rita Sousa", "Cozinha nova"], ["Joana Ribeiro", "Remodelação WC principal"]]) {
      expect(coluna(S, nome, titulo), `${nome} · ${titulo}`).toBeUndefined();
    }
  });
  it("a V2 tem UM cartão por negócio: a Carla tem 3 cartões (não 5) e o da varanda traz os dois orçamentos", () => {
    const carla = cs.filter((c) => c.nome === "Carla Nunes");
    expect(carla).toHaveLength(3);
    expect(negociosPorPessoa(cs)["Carla Nunes"]).toBe(3);
    expect(new Set(carla.map((c) => c.id)).size).toBe(3);
    const varanda = carla.find((c) => c.titulo === "Varanda fechada")!;
    expect(varanda).toMatchObject({ orcamentos: 2, servico: "Varanda fechada · 2 orçamentos", demo: true, negocioId: 1031 });
    expect(varanda.valor).toBeCloseTo(3480 + 4260, 2);
    expect(varanda.linhas?.map((l) => l.valor)).toEqual([3480, 4260]);
    const cozinha = carla.find((c) => c.titulo === "Cozinha")!;
    expect(cozinha).toMatchObject({ orcamentos: 1, demo: false });
    expect(cozinha.linhas).toBeUndefined();
  });
  it("ids dos cartões únicos e estáveis", () => {
    const a = cs.map((c) => c.id);
    expect(new Set(a).size).toBe(a.length);
    expect(cartoesV2(seed()).map((c) => c.id)).toEqual(a);
  });
});

describe("matriz de exemplos · ninguém muda de papel", () => {
  it("as mesmas 8 leads e 3 clientes de sempre, e os mesmos da regra de leads", () => {
    const S = seed();
    expect(leadsApp(S).map((p) => p.nome).sort()).toEqual(NOMES.slice(0, 8).sort());
    expect(clientesApp(S).map((p) => p.nome).sort()).toEqual(NOMES.slice(8).sort());
    expect(leadsApp(S).map((p) => p.nome)).toEqual(leadsDe(S).map((p) => p.nome));
  });
  it("pelo menos 4 pessoas com 2 ou mais negócios", () => {
    expect(todosApp(seed()).filter((p) => p.todos.length >= 2).length).toBeGreaterThanOrEqual(4);
  });
  it("nenhum negócio de exemplo de uma lead está ganho: só os da seed decidem o papel", () => {
    const exemplos = leadsApp(seed()).flatMap((p) => p.todos.filter((n) => n.demo));
    expect(exemplos).toHaveLength(4); // Carla (2), Sérgio (1) e Rita Sousa (1, perdido)
    expect(exemplos.every((n) => !ehGanho(n.deal))).toBe(true);
  });
});
