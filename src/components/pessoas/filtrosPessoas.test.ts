import { describe, expect, it } from "vitest";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import {
  LIMITE_SEM_CONTACTO, contagensChips, filtrarPessoas, ordenarPessoas, pesquisaCorresponde,
} from "./filtrosPessoas";
import { juntarPessoas } from "./juntarPessoas";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO, SUBMISSOES_EXEMPLO } from "./pessoasExemplo";
import type { FiltrosPessoas } from "./pessoasTipos";
import { pessoasComPendentes } from "./resolverSubmissao";

const todos = juntarPessoas(PESSOAS_EXEMPLO, NEGOCIOS_PESSOAS_EXEMPLO, HOJE_EXEMPLO);
const pendentes = pessoasComPendentes(SUBMISSOES_EXEMPLO);
const SEM: FiltrosPessoas = { chip: "todos", pesquisa: "" };
const nomes = (f: Partial<FiltrosPessoas>) =>
  filtrarPessoas(todos, { ...SEM, ...f }, pendentes).map((r) => r.pessoa.nome);

describe("chips", () => {
  it("contagens sem pesquisa", () => {
    expect(contagensChips(todos, "", pendentes)).toEqual({
      todos: 13, leads: 7, clientes: 6, semNegocio: 3, voltou: 7, semContacto: 6,
    });
  });

  it("as contagens respeitam a pesquisa (os outros filtros)", () => {
    expect(contagensChips(todos, "marta", pendentes)).toEqual({
      todos: 1, leads: 0, clientes: 1, semNegocio: 0, voltou: 1, semContacto: 0,
    });
  });

  it("a contagem de cada chip é o nº de linhas que o chip mostra", () => {
    const c = contagensChips(todos, "", pendentes);
    (Object.keys(c) as (keyof typeof c)[]).forEach((chip) => {
      expect(filtrarPessoas(todos, { ...SEM, chip }, pendentes)).toHaveLength(c[chip]);
    });
  });

  it("Voltou a contactar = tem submissão pendente (candidatas do conflito incluídas)", () => {
    expect(nomes({ chip: "voltou" }).sort()).toEqual(
      ["Clara Dias", "Helena Tavares", "Hugo Teixeira", "Marta Silveira", "Paulo Neves", "Rui Figueiredo", "Sofia Matos"],
    );
  });

  it("Sem contacto 7+ usa a constante própria (>= 7 dias)", () => {
    expect(LIMITE_SEM_CONTACTO).toBe(7);
    const esperado = todos.filter((r) => r.pessoa.ultimoContactoDias >= LIMITE_SEM_CONTACTO).map((r) => r.pessoa.nome);
    expect(nomes({ chip: "semContacto" })).toEqual(esperado);
    expect(todos.some((r) => r.pessoa.ultimoContactoDias === 7)).toBe(false);
  });

  it("Leads, Clientes e Sem negócio", () => {
    expect(nomes({ chip: "leads" })).toHaveLength(7);
    expect(nomes({ chip: "clientes" })).toHaveLength(6);
    expect(nomes({ chip: "semNegocio" }).sort()).toEqual(["Beatriz Sampaio", "Hugo Teixeira", "Lúcia Faria"]);
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

  it("por telefone, com ou sem espaços", () => {
    expect(nomes({ pesquisa: "914 567" })).toEqual(["Paulo Neves"]);
    expect(nomes({ pesquisa: "914567803" })).toEqual(["Paulo Neves"]);
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

  it("pesquisa e chip combinam-se", () => {
    expect(nomes({ chip: "clientes", pesquisa: "a" }).length).toBeLessThan(6);
    expect(nomes({ chip: "leads", pesquisa: "marta" })).toEqual([]);
  });
});

describe("ordenação", () => {
  const ordem = (o: Parameters<typeof ordenarPessoas>[1]) =>
    ordenarPessoas(todos, o, pendentes).map((r) => r.pessoa.nome);

  it("Precisa de atenção: com submissão primeiro, depois pior saúde, depois nome", () => {
    expect(ordem("atencao")).toEqual([
      "Clara Dias", "Helena Tavares", "Hugo Teixeira", "Marta Silveira", "Paulo Neves", "Rui Figueiredo", "Sofia Matos",
      "Nuno Barros", "Tiago Rocha", "Vasco Pinto", "Beatriz Sampaio", "Inês Pacheco", "Lúcia Faria",
    ]);
  });

  it("Nome: ordem alfabética em português", () => {
    const n = ordem("nome");
    expect(n[0]).toBe("Beatriz Sampaio");
    expect(n[n.length - 1]).toBe("Vasco Pinto");
    expect(n.indexOf("Inês Pacheco")).toBeLessThan(n.indexOf("Lúcia Faria"));
  });

  it("Último contacto: o que está há mais tempo sem contacto primeiro", () => {
    const dias = ordenarPessoas(todos, "ultimoContacto", pendentes).map((r) => r.pessoa.ultimoContactoDias);
    expect(dias).toEqual([...dias].sort((a, b) => b - a));
    expect(dias[0]).toBe(30);
  });

  it("Valor: maior primeiro", () => {
    expect(ordem("valor").slice(0, 3)).toEqual(["Vasco Pinto", "Rui Figueiredo", "Clara Dias"]);
  });

  it("não altera a lista recebida", () => {
    const antes = todos.map((r) => r.pessoa.id);
    ordenarPessoas(todos, "nome", pendentes);
    expect(todos.map((r) => r.pessoa.id)).toEqual(antes);
  });

  it("lista vazia dá lista vazia", () => {
    expect(ordenarPessoas([], "atencao", new Set())).toEqual([]);
  });
});
