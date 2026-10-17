import { describe, expect, it } from "vitest";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import {
  FILTROS_INICIAIS, FORMULARIO_MANUAL, LIMITE_SEM_CONTACTO, chipsDoTipo, chipValido, contagensChips, contagensTipos, filtrarPessoas,
  filtrosAtivos, ordenarPessoas, pesquisaCorresponde, resultadoEfetivo,
} from "./filtrosPessoas";
import { pedidoBase, pessoaBase, resumoBase, visitaBase } from "./fabricaTestes";
import { juntarPessoas } from "./juntarPessoas";
import { PEDIDOS_EXEMPLO } from "./pedidosDeExemplo";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO, SUBMISSOES_EXEMPLO } from "./pessoasExemplo";
import type { FiltrosPessoas } from "./pessoasTipos";
import { pessoasComPendentes } from "./resolverSubmissao";

const todos = juntarPessoas(PESSOAS_EXEMPLO, NEGOCIOS_PESSOAS_EXEMPLO, HOJE_EXEMPLO, PEDIDOS_EXEMPLO);
const pendentes = pessoasComPendentes(SUBMISSOES_EXEMPLO);
const nomes = (f: Partial<FiltrosPessoas>) =>
  filtrarPessoas(todos, { ...FILTROS_INICIAIS, ...f }, pendentes).map((r) => r.pessoa.nome).sort();

describe("o seletor Leads, Clientes, Todos", () => {
  it("abre em Todos e as perdidas só contam em Todos", () => {
    expect(FILTROS_INICIAIS.tipo).toBe("todos");
    expect(contagensTipos(todos, FILTROS_INICIAIS, pendentes)).toEqual({ leads: 9, clientes: 6, todos: 17 });
  });
  it("Leads não inclui as perdidas; Clientes são os 6 com negócio ganho", () => {
    expect(nomes({ tipo: "leads" })).toHaveLength(9);
    expect(nomes({ tipo: "leads" })).not.toContain("Joana Bastos");
    expect(nomes({ tipo: "clientes" })).toEqual(["Helena Tavares", "Inês Pacheco", "Marta Silveira", "Paulo Neves", "Rui Figueiredo", "Sofia Matos"]);
    expect(nomes({ tipo: "todos" })).toHaveLength(17);
  });
  it("as contagens respeitam a pesquisa e os outros filtros", () => {
    expect(contagensTipos(todos, { ...FILTROS_INICIAIS, pesquisa: "marta" }, pendentes)).toEqual({ leads: 0, clientes: 1, todos: 1 });
    expect(contagensTipos(todos, { ...FILTROS_INICIAIS, soMinhas: true }, pendentes)).toEqual({ leads: 3, clientes: 2, todos: 5 });
  });
});

describe("chips", () => {
  it("contagens em Todos", () => {
    expect(contagensChips(todos, FILTROS_INICIAIS, pendentes)).toEqual({ todas: 17, porContactar: 2, atrasadas: 4, perdidas: 2 });
  });
  it("em Leads não há perdidas e em Clientes só Todas e Atrasadas", () => {
    expect(contagensChips(todos, { ...FILTROS_INICIAIS, tipo: "leads" }, pendentes)).toEqual({ todas: 9, porContactar: 2, atrasadas: 3, perdidas: 0 });
    expect(chipsDoTipo("clientes")).toEqual(["todas", "atrasadas"]);
    expect(chipsDoTipo("leads")).toEqual(["todas", "porContactar", "atrasadas"]);
    expect(chipsDoTipo("todos")).toEqual(["todas", "porContactar", "atrasadas", "perdidas"]);
    expect(contagensChips(todos, { ...FILTROS_INICIAIS, tipo: "clientes" }, pendentes).atrasadas).toBe(1);
  });
  it("a contagem de cada chip é o nº de linhas que o chip mostra", () => {
    const c = contagensChips(todos, FILTROS_INICIAIS, pendentes);
    (Object.keys(c) as (keyof typeof c)[]).forEach((chip) => {
      expect(filtrarPessoas(todos, { ...FILTROS_INICIAIS, chip }, pendentes)).toHaveLength(c[chip]);
    });
  });
  it("Atrasadas: leads com contacto atrasado e clientes só com negócio em curso atrasado", () => {
    expect(nomes({ chip: "atrasadas" })).toEqual(["Gonçalo Matias", "Lúcia Faria", "Paulo Neves", "Tiago Rocha"]);
  });
  it("Por contactar: as leads sem chamada; Perdidas: as duas perdidas", () => {
    expect(nomes({ chip: "porContactar" })).toEqual(["Beatriz Sampaio", "Hugo Teixeira"]);
    expect(nomes({ chip: "perdidas" })).toEqual(["Fábio Lemos", "Joana Bastos"]);
  });
  it("um chip que o tipo não tem volta a Todas", () => {
    expect(chipValido("clientes", "perdidas")).toBe("todas");
    expect(chipValido("clientes", "atrasadas")).toBe("atrasadas");
    expect(nomes({ tipo: "clientes", chip: "perdidas" })).toHaveLength(6);
  });
});

describe("filtros do popover", () => {
  it("Voltou a contactar = tem submissão pendente (candidatas do conflito incluídas)", () => {
    expect(nomes({ voltou: true })).toEqual(
      ["Clara Dias", "Helena Tavares", "Hugo Teixeira", "Marta Silveira", "Paulo Neves", "Rui Figueiredo", "Sofia Matos"],
    );
  });
  it("Com visita: quem tem algum pedido em Visita e não está perdida", () => {
    // A Rita (visita hoje) e o Gonçalo (visita por concluir) são leads; o Paulo é cliente com um pedido com visita marcada.
    expect(nomes({ comVisita: true })).toEqual(["Gonçalo Matias", "Paulo Neves", "Rita Albuquerque"]);
  });
  it("Com visita: basta um dos pedidos estar em Visita; uma visita só cancelada não conta, nem a de uma perdida", () => {
    const pedidos = (id: string) => [pedidoBase("pd-1", { pessoaId: id }), pedidoBase("pd-2", { pessoaId: id, visitas: [visitaBase("v")] })];
    const cancelada = [pedidoBase("pd-3", { pessoaId: "b", visitas: [visitaBase("w", { estado: "cancelada" })] })];
    const perdida = { perdida: { motivo: "preco" as const, data: "2026-10-01" } };
    const resumos = [
      resumoBase(pessoaBase("a"), [], HOJE_EXEMPLO, "lead", pedidos("a")), resumoBase(pessoaBase("b"), [], HOJE_EXEMPLO, "lead", cancelada),
      resumoBase(pessoaBase("c", perdida), [], HOJE_EXEMPLO, "lead", pedidos("c")),
    ];
    const filtrados = filtrarPessoas(resumos, { ...FILTROS_INICIAIS, comVisita: true }, pendentes);
    expect(filtrados.map((r) => r.pessoa.id)).toEqual(["a"]);
  });
  it("Só as minhas usa o comercial de exemplo", () => {
    expect(nomes({ soMinhas: true })).toEqual(["Beatriz Sampaio", "Marta Silveira", "Rita Albuquerque", "Rui Figueiredo", "Vasco Pinto"]);
  });
  it("Comercial, Formulário (incluindo Registada à mão) e Resultado do último contacto", () => {
    expect(nomes({ comercial: "Diogo Lopes" })).toEqual(["Clara Dias", "Inês Pacheco", "Tiago Rocha"]);
    expect(nomes({ formulario: "Contacto geral" })).toEqual(["Beatriz Sampaio", "Sofia Matos"]);
    expect(nomes({ formulario: FORMULARIO_MANUAL })).toHaveLength(6);
    expect(nomes({ resultado: "semContacto" })).toEqual(["Beatriz Sampaio", "Hugo Teixeira"]);
    expect(nomes({ resultado: "semInteresse" })).toEqual(["Fábio Lemos"]);
  });
  it("o resultado aplica-se a qualquer pessoa e sem chamada é Sem contacto", () => {
    expect(resultadoEfetivo({ resultadoContacto: undefined })).toBe("semContacto");
    expect(nomes({ resultado: "atendeuInteressado", tipo: "clientes" })).toEqual(["Helena Tavares", "Marta Silveira", "Paulo Neves"]);
  });
  it("o contador conta os interruptores e selects ativos (Atrasadas é o chip)", () => {
    expect(filtrosAtivos(FILTROS_INICIAIS)).toBe(0);
    expect(filtrosAtivos({ ...FILTROS_INICIAIS, voltou: true, soMinhas: true, comercial: "Ana Ribeiro", chip: "atrasadas" })).toBe(4);
    expect(filtrosAtivos({ ...FILTROS_INICIAIS, chip: "porContactar" })).toBe(0);
  });
});

describe("pesquisa", () => {
  it("por nome, sem acentos nem maiúsculas", () => {
    expect(nomes({ pesquisa: "INES" })).toEqual(["Inês Pacheco"]);
    expect(nomes({ pesquisa: "  lucia " })).toEqual(["Lúcia Faria"]);
  });
  it("por email", () => {
    expect(nomes({ pesquisa: "clara.dias@" })).toEqual(["Clara Dias"]);
  });
  it("por localidade, sem acentos", () => {
    expect(nomes({ pesquisa: "viseu" })).toEqual(["Beatriz Sampaio", "Vasco Pinto"]);
    expect(nomes({ pesquisa: "SETUBAL" })).toEqual(["Inês Pacheco", "Nuno Barros"]);
  });
  it("por telefone, com ou sem espaços", () => {
    expect(nomes({ pesquisa: "914 567" })).toEqual(["Paulo Neves"]);
    expect(nomes({ pesquisa: "914567803" })).toEqual(["Paulo Neves"]);
  });
  it("não procura pelo serviço", () => {
    expect(nomes({ pesquisa: "Pavimento" })).toEqual([]);
  });
  it("sem resultados dá lista vazia; caracteres especiais não rebentam", () => {
    expect(nomes({ pesquisa: "zzzz" })).toEqual([]);
    expect(nomes({ pesquisa: "(.*[" })).toEqual([]);
  });
  it("pesquisa vazia ou só espaços corresponde a tudo; pessoa sem contacto não rebenta", () => {
    const tiago = todos.find((r) => r.pessoa.nome === "Tiago Rocha")!.pessoa;
    expect(pesquisaCorresponde(tiago, "   ")).toBe(true);
    expect(pesquisaCorresponde(tiago, "912")).toBe(false);
  });
  it("pesquisa e tipo combinam-se", () => {
    expect(nomes({ tipo: "leads", pesquisa: "marta" })).toEqual([]);
  });
});

describe("sem contacto há N dias", () => {
  it("o limite é 7 dias", () => {
    expect(LIMITE_SEM_CONTACTO).toBe(7);
  });
});

describe("ordenação", () => {
  const ordem = (o: Parameters<typeof ordenarPessoas>[1]) => ordenarPessoas(todos, o, pendentes).map((r) => r.pessoa.nome);

  it("Urgência: voltou a contactar e atrasadas primeiro, depois a pior saúde, as perdidas no fim", () => {
    expect(ordem("urgencia")).toEqual([
      "Paulo Neves", "Clara Dias", "Marta Silveira", "Helena Tavares", "Hugo Teixeira", "Rui Figueiredo", "Sofia Matos",
      "Tiago Rocha", "Gonçalo Matias", "Lúcia Faria", "Nuno Barros", "Vasco Pinto", "Beatriz Sampaio", "Inês Pacheco",
      "Rita Albuquerque", "Fábio Lemos", "Joana Bastos",
    ]);
  });
  it("Mais recentes: a que chegou há menos tempo primeiro", () => {
    expect(ordem("recentes").slice(0, 3)).toEqual(["Hugo Teixeira", "Beatriz Sampaio", "Gonçalo Matias"]);
    expect(ordem("recentes")[16]).toBe("Inês Pacheco");
  });
  it("Valor: o maior valor em jogo primeiro, em empate por nome", () => {
    expect(ordem("valor").slice(0, 5)).toEqual(["Vasco Pinto", "Clara Dias", "Nuno Barros", "Paulo Neves", "Marta Silveira"]);
  });
  it("não altera a lista recebida e lista vazia dá lista vazia", () => {
    const antes = todos.map((r) => r.pessoa.id);
    ordenarPessoas(todos, "valor", pendentes);
    expect(todos.map((r) => r.pessoa.id)).toEqual(antes);
    expect(ordenarPessoas([], "urgencia", new Set())).toEqual([]);
  });
});
