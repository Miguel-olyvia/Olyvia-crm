import { describe, expect, it } from "vitest";
import {
  aplicarFiltro,
  ordenar,
  quantosFiltros,
  temFiltro,
  type OrdemFiltravel,
} from "../filtros-de-ordens";

/**
 * O que aqui se prova: que cada condição estreita só o que devia, que "sem
 * dono" é uma resposta e não a ausência de filtro, e que a lista nunca salta
 * de ordem entre visitas.
 */

const o = (p: Partial<OrdemFiltravel> & { codigo: string }): OrdemFiltravel => ({
  id: p.codigo,
  titulo: "Trabalho",
  estado: "agendada",
  origem: "preventiva",
  prioridade: "normal",
  cliente_id: "c1",
  local_id: null,
  responsavel_id: "r1",
  agendada_para: "2026-09-10T09:00:00Z",
  criada_em: "2026-09-01T09:00:00Z",
  ...p,
});

const LISTA: OrdemFiltravel[] = [
  o({ codigo: "OT-1", prioridade: "urgente", origem: "corretiva" }),
  o({ codigo: "OT-2", responsavel_id: null, cliente_id: "c2" }),
  o({ codigo: "OT-3", titulo: "Extintor da garagem", prioridade: "baixa" }),
  o({ codigo: "OT-4", origem: "obra", responsavel_id: "r2" }),
];

const NOMES: Record<string, string> = { c1: "Condomínio Sol", c2: "Padaria Lima" };
const nome = (id: string) => NOMES[id] ?? null;

describe("um filtro vazio", () => {
  it("não estreita nada", () => {
    expect(aplicarFiltro(LISTA, {})).toHaveLength(4);
  });

  it("e não se anuncia", () => {
    expect(temFiltro({})).toBe(false);
    expect(quantosFiltros({})).toBe(0);
    // Espaços não são um filtro.
    expect(temFiltro({ texto: "   " })).toBe(false);
  });
});

describe("cada condição estreita só o que devia", () => {
  it("por responsável", () => {
    expect(aplicarFiltro(LISTA, { responsavelId: "r2" }).map((x) => x.codigo)).toEqual([
      "OT-4",
    ]);
  });

  // Uma ordem marcada e sem dono é exatamente o que se vai procurar.
  it("por SEM dono", () => {
    expect(aplicarFiltro(LISTA, { responsavelId: "ninguem" }).map((x) => x.codigo)).toEqual(
      ["OT-2"]
    );
  });

  it("por cliente", () => {
    expect(aplicarFiltro(LISTA, { clienteId: "c2" }).map((x) => x.codigo)).toEqual(["OT-2"]);
  });

  it("por prioridade", () => {
    expect(aplicarFiltro(LISTA, { prioridade: "urgente" }).map((x) => x.codigo)).toEqual([
      "OT-1",
    ]);
  });

  it("por origem", () => {
    expect(aplicarFiltro(LISTA, { origem: "obra" }).map((x) => x.codigo)).toEqual(["OT-4"]);
  });

  it("e duas ao mesmo tempo somam-se, não se substituem", () => {
    expect(
      aplicarFiltro(LISTA, { clienteId: "c1", prioridade: "baixa" }).map((x) => x.codigo)
    ).toEqual(["OT-3"]);
  });
});

describe("a procura", () => {
  it("apanha o código", () => {
    expect(aplicarFiltro(LISTA, { texto: "ot-3" }, nome).map((x) => x.codigo)).toEqual([
      "OT-3",
    ]);
  });

  it("apanha o título", () => {
    expect(aplicarFiltro(LISTA, { texto: "garagem" }, nome).map((x) => x.codigo)).toEqual([
      "OT-3",
    ]);
  });

  // Procurar pelo nome do cliente é o que toda a gente tenta primeiro.
  it("apanha o nome do cliente", () => {
    expect(aplicarFiltro(LISTA, { texto: "padaria" }, nome).map((x) => x.codigo)).toEqual([
      "OT-2",
    ]);
  });

  it("sem saber os nomes, não rebenta", () => {
    expect(aplicarFiltro(LISTA, { texto: "padaria" })).toHaveLength(0);
  });
});

describe("a ordem da lista", () => {
  const comDatas: OrdemFiltravel[] = [
    o({ codigo: "OT-B", agendada_para: "2026-09-12T09:00:00Z", prioridade: "baixa" }),
    o({ codigo: "OT-A", agendada_para: "2026-09-10T09:00:00Z", prioridade: "normal" }),
    o({ codigo: "OT-C", agendada_para: null, prioridade: "urgente" }),
  ];

  it("por data, o mais cedo primeiro", () => {
    expect(ordenar(comDatas, "data").map((x) => x.codigo)).toEqual([
      "OT-A",
      "OT-B",
      "OT-C",
    ]);
  });

  // Sem data não é "para já": é "por marcar". Vai para o fim.
  it("e o que não tem data vai para o fim", () => {
    const porData = ordenar(comDatas, "data");
    expect(porData[porData.length - 1].codigo).toBe("OT-C");
  });

  it("por prioridade, urgente em cima", () => {
    expect(ordenar(comDatas, "prioridade")[0].codigo).toBe("OT-C");
  });

  it("por mais recentes, a última a nascer em cima", () => {
    const nascidas = [
      o({ codigo: "OT-X", criada_em: "2026-09-01T09:00:00Z" }),
      o({ codigo: "OT-Y", criada_em: "2026-09-05T09:00:00Z" }),
    ];
    expect(ordenar(nascidas, "recentes")[0].codigo).toBe("OT-Y");
  });

  // Uma lista que salta entre visitas é uma lista que ninguém segue.
  it("empates resolvem-se sempre pelo código, e nunca ao acaso", () => {
    const iguais = [
      o({ codigo: "OT-9" }),
      o({ codigo: "OT-2" }),
      o({ codigo: "OT-5" }),
    ];
    expect(ordenar(iguais, "data").map((x) => x.codigo)).toEqual([
      "OT-2",
      "OT-5",
      "OT-9",
    ]);
    expect(ordenar([...iguais].reverse(), "data").map((x) => x.codigo)).toEqual([
      "OT-2",
      "OT-5",
      "OT-9",
    ]);
  });

  it("não mexe na lista original", () => {
    const antes = LISTA.map((x) => x.codigo);
    ordenar(LISTA, "prioridade");
    expect(LISTA.map((x) => x.codigo)).toEqual(antes);
  });
});
