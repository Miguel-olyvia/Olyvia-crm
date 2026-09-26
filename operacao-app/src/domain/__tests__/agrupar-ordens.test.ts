import { describe, expect, it } from "vitest";
import { agruparPorQuando, grupoDaOrdem } from "../agrupar-ordens";
import type { OrdemFiltravel } from "../filtros-de-ordens";

/**
 * O que aqui se prova: que cada ordem cai na faixa certa, que uma ordem já
 * fechada nunca é acusada de estar atrasada, que as faixas vazias não aparecem,
 * e que agrupar não reordena nada.
 *
 * A referência é uma quarta-feira: 16 de setembro de 2026, às 10h. Escolhida
 * de propósito — num fim de semana a faixa "Até domingo" comporta-se de outra
 * maneira, e essa está testada à parte.
 */
const QUARTA = new Date(2026, 8, 16, 10, 0, 0);

const o = (p: Partial<OrdemFiltravel> & { codigo: string }): OrdemFiltravel => ({
  id: p.codigo,
  titulo: "Trabalho",
  estado: "agendada",
  origem: "preventiva",
  prioridade: "normal",
  cliente_id: "c1",
  local_id: null,
  responsavel_id: "r1",
  agendada_para: null,
  criada_em: "2026-09-01T09:00:00Z",
  ...p,
});

/** Uma data local, para os testes não dependerem do fuso de quem os corre. */
const em = (dia: number, hora = 9) => new Date(2026, 8, dia, hora, 0, 0).toISOString();

describe("a que faixa pertence uma ordem", () => {
  it("sem data, vai para «sem data»", () => {
    expect(grupoDaOrdem({ estado: "agendada", agendada_para: null }, QUARTA)).toBe("sem_data");
  });

  it("com uma data que não se lê, também", () => {
    expect(grupoDaOrdem({ estado: "agendada", agendada_para: "ontem" }, QUARTA)).toBe("sem_data");
  });

  it("marcada para hoje mais tarde, é de hoje", () => {
    expect(grupoDaOrdem({ estado: "agendada", agendada_para: em(16, 15) }, QUARTA)).toBe("hoje");
  });

  it("marcada para hoje de manhã e ainda por fechar, está atrasada", () => {
    expect(grupoDaOrdem({ estado: "agendada", agendada_para: em(16, 8) }, QUARTA)).toBe(
      "atrasadas"
    );
  });

  it("amanhã é amanhã, e não «esta semana»", () => {
    expect(grupoDaOrdem({ estado: "agendada", agendada_para: em(17) }, QUARTA)).toBe("amanha");
  });

  it("sexta e domingo ainda são desta semana", () => {
    expect(grupoDaOrdem({ estado: "agendada", agendada_para: em(18) }, QUARTA)).toBe(
      "esta_semana"
    );
    expect(grupoDaOrdem({ estado: "agendada", agendada_para: em(20) }, QUARTA)).toBe(
      "esta_semana"
    );
  });

  it("a segunda seguinte já é «mais tarde»", () => {
    expect(grupoDaOrdem({ estado: "agendada", agendada_para: em(21) }, QUARTA)).toBe("depois");
  });
});

describe("uma ordem que já não espera trabalho", () => {
  /*
   * Isto é a diferença entre uma lista útil e uma lista que acusa. Uma ordem
   * confirmada em maio, marcada para abril, continua a ter a data no passado —
   * e não está atrasada coisa nenhuma: está feita.
   */
  it("nunca é atrasada: vai para «já passou», que é o que é verdade", () => {
    expect(grupoDaOrdem({ estado: "confirmada", agendada_para: em(2) }, QUARTA)).toBe(
      "passadas"
    );
    expect(grupoDaOrdem({ estado: "cancelada", agendada_para: em(2) }, QUARTA)).toBe("passadas");
  });

  it("e uma pausada também não — parou, não se atrasou", () => {
    expect(grupoDaOrdem({ estado: "pausada", agendada_para: em(2) }, QUARTA)).toBe("passadas");
  });

  /*
   * O contrário disto é o que interessa: a mesma data, numa ordem que ainda
   * espera trabalho, é um atraso e tem de gritar.
   */
  it("mas a mesma data numa ordem por fazer é um atraso", () => {
    expect(grupoDaOrdem({ estado: "agendada", agendada_para: em(2) }, QUARTA)).toBe("atrasadas");
  });

  it("uma fechada marcada para hoje continua a ser de hoje", () => {
    expect(grupoDaOrdem({ estado: "fechada", agendada_para: em(16, 8) }, QUARTA)).toBe("hoje");
  });
});

describe("ao domingo", () => {
  const DOMINGO = new Date(2026, 8, 20, 10, 0, 0);

  it("não resta semana nenhuma: o dia seguinte é «mais tarde»", () => {
    // Segunda-feira, dia 21: é amanhã, e por isso tem faixa própria.
    expect(grupoDaOrdem({ estado: "agendada", agendada_para: em(21) }, DOMINGO)).toBe("amanha");
    // Terça, dia 22: já é da semana seguinte.
    expect(grupoDaOrdem({ estado: "agendada", agendada_para: em(22) }, DOMINGO)).toBe("depois");
  });
});

describe("agrupar a lista", () => {
  const LISTA = [
    o({ codigo: "OT-1", agendada_para: em(16, 8) }), // atrasada
    o({ codigo: "OT-2", agendada_para: em(16, 15) }), // hoje
    o({ codigo: "OT-3", agendada_para: em(17) }), // amanhã
    o({ codigo: "OT-4" }), // sem data
    o({ codigo: "OT-5", agendada_para: em(16, 17) }), // hoje, mais tarde
  ];

  it("dá as faixas pela ordem em que se lêem", () => {
    const grupos = agruparPorQuando(LISTA, QUARTA);
    expect(grupos.map((g) => g.chave)).toEqual(["atrasadas", "hoje", "amanha", "sem_data"]);
  });

  it("não inventa faixas vazias", () => {
    const grupos = agruparPorQuando(LISTA, QUARTA);
    // "Até domingo" e "Mais tarde" não têm nada, e por isso não existem.
    expect(grupos.some((g) => g.chave === "esta_semana")).toBe(false);
    expect(grupos.every((g) => g.ordens.length > 0)).toBe(true);
  });

  it("mantém dentro de cada faixa a ordem por que veio", () => {
    const grupos = agruparPorQuando(LISTA, QUARTA);
    const hoje = grupos.find((g) => g.chave === "hoje")!;
    expect(hoje.ordens.map((x) => x.codigo)).toEqual(["OT-2", "OT-5"]);
  });

  it("não perde nem duplica nenhuma ordem", () => {
    const grupos = agruparPorQuando(LISTA, QUARTA);
    const total = grupos.reduce((s, g) => s + g.ordens.length, 0);
    expect(total).toBe(LISTA.length);
  });

  it("com uma lista vazia, não dá faixa nenhuma", () => {
    expect(agruparPorQuando([], QUARTA)).toEqual([]);
  });

  it("cada faixa traz o que quer dizer, para não ser só um título", () => {
    const grupos = agruparPorQuando(LISTA, QUARTA);
    expect(grupos.every((g) => g.rotulo.length > 0 && g.explicacao.length > 0)).toBe(true);
  });
});
