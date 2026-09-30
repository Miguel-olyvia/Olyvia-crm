import { describe, expect, it } from "vitest";
import {
  DE_ORIGEM,
  ficaSemNenhuma,
  nomeDe,
  opcoesAtivas,
  opcoesDaLista,
  type RotuloGravado,
} from "../rotulos";

/**
 * O que aqui se prova: que uma empresa que nunca abriu as Definições vê tudo
 * a funcionar, que quem lhes muda o nome vê o nome novo, e que esconder uma
 * opção não reescreve o passado.
 */

const nada: RotuloGravado[] = [];

const r = (
  lista: string,
  valor: string,
  nome: string,
  ordem = 0,
  ativo = true
): RotuloGravado => ({ lista, valor, nome, ordem, ativo });

describe("uma empresa que nunca mexeu nisto", () => {
  it("vê os nomes que vêm no código", () => {
    const p = opcoesDaLista("prioridade", nada);
    expect(p.map((o) => o.valor)).toEqual(["baixa", "normal", "alta", "urgente"]);
    expect(p.map((o) => o.nome)).toEqual(["Baixa", "Normal", "Alta", "Urgente"]);
  });

  it("tem todas as opções ativas", () => {
    for (const lista of ["prioridade", "criticidade", "tipo_tarefa", "tipo_local", "origem"] as const) {
      expect(opcoesAtivas(lista, nada)).toHaveLength(DE_ORIGEM[lista].length);
    }
  });
});

describe("uma empresa de limpezas", () => {
  // "Proação" não quer dizer nada a ninguém fora da manutenção industrial.
  const meus = [
    r("tipo_tarefa", "proacao", "Reforço"),
    r("tipo_tarefa", "inspecao", "Vistoria"),
  ];

  it("vê os nomes que escolheu", () => {
    expect(nomeDe("tipo_tarefa", "proacao", meus)).toBe("Reforço");
    expect(nomeDe("tipo_tarefa", "inspecao", meus)).toBe("Vistoria");
  });

  it("e o resto continua com o nome de origem", () => {
    expect(nomeDe("tipo_tarefa", "limpeza", meus)).toBe("Limpeza");
  });
});

describe("esconder", () => {
  const semObra = [r("origem", "obra", "Obra", 2, false)];

  it("tira das caixas de escolha", () => {
    expect(opcoesAtivas("origem", semObra).map((o) => o.valor)).toEqual([
      "preventiva",
      "corretiva",
    ]);
  });

  // Uma ordem de há dois anos continua a ser uma obra. Reescrever o passado
  // para arrumar o presente é a maneira mais fácil de perder um histórico.
  it("mas NÃO apaga o passado", () => {
    expect(nomeDe("origem", "obra", semObra)).toBe("Obra");
    expect(opcoesDaLista("origem", semObra)).toHaveLength(3);
  });

  it("avisa antes de a lista ficar vazia", () => {
    const soUma = [
      r("origem", "corretiva", "Corretiva", 1, false),
      r("origem", "obra", "Obra", 2, false),
    ];
    expect(ficaSemNenhuma("origem", "preventiva", soUma)).toBe(true);
    expect(ficaSemNenhuma("origem", "preventiva", nada)).toBe(false);
  });
});

describe("a ordem", () => {
  it("é a que a empresa escolheu", () => {
    const meus = [
      r("prioridade", "urgente", "Urgente", 0),
      r("prioridade", "baixa", "Baixa", 9),
    ];
    expect(opcoesDaLista("prioridade", meus).map((o) => o.valor)).toEqual([
      "urgente",
      "normal",
      "alta",
      "baixa",
    ]);
  });

  it("e empates resolvem-se pela ordem do código, não ao acaso", () => {
    const meus = [
      r("prioridade", "alta", "Alta", 0),
      r("prioridade", "urgente", "Urgente", 0),
    ];
    const v = opcoesDaLista("prioridade", meus).map((o) => o.valor);
    expect(v.indexOf("alta")).toBeLessThan(v.indexOf("urgente"));
  });
});

describe("o que não se conhece", () => {
  // Um valor gravado numa ordem antiga que já não está no código não pode
  // desaparecer do ecrã: mostra-se como está.
  it("mostra-se como está, em vez de sumir", () => {
    expect(nomeDe("prioridade", "critico_legado", nada)).toBe("critico_legado");
  });

  it("e sem valor nenhum mostra um travessão", () => {
    expect(nomeDe("prioridade", null, nada)).toBe("—");
  });

  // Uma linha de outra lista não pode contaminar esta.
  it("uma linha de outra lista é ignorada", () => {
    const meus = [r("criticidade", "alta", "Paragem de linha")];
    expect(nomeDe("prioridade", "alta", meus)).toBe("Alta");
    expect(nomeDe("criticidade", "alta", meus)).toBe("Paragem de linha");
  });
});
