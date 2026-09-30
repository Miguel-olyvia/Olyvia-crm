import { describe, expect, it } from "vitest";
import {
  emLinguagem,
  resumoDoPeriodo,
  topoPor,
  type OrdemDoPeriodo,
} from "../resumo-do-periodo";

/**
 * O que aqui se prova: que os números somam o que dizem somar, que "não há de
 * quê tirar média" não vira zero, e que uma ordem sem data marcada nunca conta
 * como atrasada — nunca teve hora para chegar.
 */

const DE = new Date("2026-09-01T00:00:00Z");
const ATE = new Date("2026-09-30T23:59:59Z");
const AGORA = new Date("2026-09-15T12:00:00Z");

const o = (p: Partial<OrdemDoPeriodo> & { codigo: string }): OrdemDoPeriodo => ({
  id: p.codigo,
  estado: "agendada",
  origem: "preventiva",
  prioridade: "normal",
  cliente_id: "c1",
  local_id: "l1",
  responsavel_id: "r1",
  criada_em: "2026-09-02T09:00:00Z",
  agendada_para: null,
  iniciada_em: null,
  fechada_em: null,
  ...p,
});

describe("quanto entrou e quanto saiu", () => {
  const lista = [
    o({ codigo: "A", criada_em: "2026-09-02T09:00:00Z" }),
    o({ codigo: "B", criada_em: "2026-09-05T09:00:00Z" }),
    // Nasceu antes do período, mas fechou dentro dele. Conta como fechada e
    // NÃO como aberta — as duas contas respondem a perguntas diferentes.
    o({
      codigo: "C",
      criada_em: "2026-08-20T09:00:00Z",
      estado: "confirmada",
      fechada_em: "2026-09-03T09:00:00Z",
    }),
    // Fora do período nos dois lados.
    o({ codigo: "D", criada_em: "2026-07-01T09:00:00Z" }),
  ];

  const r = resumoDoPeriodo(lista, DE, ATE, AGORA);

  it("conta as que nasceram dentro", () => {
    expect(r.abertas).toBe(2);
  });

  it("conta as que fecharam dentro, mesmo tendo nascido antes", () => {
    expect(r.fechadas).toBe(1);
  });

  it("e as que continuam por fechar, hoje", () => {
    expect(r.emAberto).toBe(3);
  });
});

describe("atrasos e pontualidade", () => {
  // Uma ordem sem data nunca chegou tarde: nunca teve hora para chegar.
  it("uma ordem sem data marcada não está atrasada", () => {
    const r = resumoDoPeriodo([o({ codigo: "A", agendada_para: null })], DE, ATE, AGORA);
    expect(r.atrasadas).toBe(0);
  });

  it("uma ordem marcada para ontem e por fechar está atrasada", () => {
    const r = resumoDoPeriodo(
      [o({ codigo: "A", agendada_para: "2026-09-10T09:00:00Z" })],
      DE,
      ATE,
      AGORA
    );
    expect(r.atrasadas).toBe(1);
  });

  it("uma ordem marcada para amanhã não está", () => {
    const r = resumoDoPeriodo(
      [o({ codigo: "A", agendada_para: "2026-09-20T09:00:00Z" })],
      DE,
      ATE,
      AGORA
    );
    expect(r.atrasadas).toBe(0);
  });

  it("a pontualidade mede-se só no que tinha data", () => {
    const r = resumoDoPeriodo(
      [
        o({
          codigo: "A",
          estado: "confirmada",
          agendada_para: "2026-09-05T09:00:00Z",
          fechada_em: "2026-09-05T08:00:00Z",
        }),
        o({
          codigo: "B",
          estado: "confirmada",
          agendada_para: "2026-09-05T09:00:00Z",
          fechada_em: "2026-09-07T09:00:00Z",
        }),
        // Sem data: não entra na conta, nem para bem nem para mal.
        o({ codigo: "C", estado: "confirmada", fechada_em: "2026-09-06T09:00:00Z" }),
      ],
      DE,
      ATE,
      AGORA
    );
    expect(r.aHoras).toBe(1);
    expect(r.foraDeHoras).toBe(1);
    expect(r.pontualidade).toBe(50);
  });

  // Zero por cento é uma acusação; "não há dados" é a verdade.
  it("sem nada com data, a pontualidade é nada — e não zero", () => {
    const r = resumoDoPeriodo(
      [o({ codigo: "A", estado: "confirmada", fechada_em: "2026-09-06T09:00:00Z" })],
      DE,
      ATE,
      AGORA
    );
    expect(r.pontualidade).toBeNull();
  });
});

describe("os tempos", () => {
  it("do nascer ao fechar, em média", () => {
    const r = resumoDoPeriodo(
      [
        o({
          codigo: "A",
          estado: "confirmada",
          criada_em: "2026-09-02T00:00:00Z",
          fechada_em: "2026-09-02T10:00:00Z",
        }),
        o({
          codigo: "B",
          estado: "confirmada",
          criada_em: "2026-09-03T00:00:00Z",
          fechada_em: "2026-09-03T20:00:00Z",
        }),
      ],
      DE,
      ATE,
      AGORA
    );
    expect(r.horasAteFechar).toBe(15);
  });

  it("e do nascer ao começar — que é o tempo de resposta", () => {
    const r = resumoDoPeriodo(
      [
        o({
          codigo: "A",
          criada_em: "2026-09-02T00:00:00Z",
          iniciada_em: "2026-09-02T04:00:00Z",
        }),
      ],
      DE,
      ATE,
      AGORA
    );
    expect(r.horasAteComecar).toBe(4);
  });

  it("sem nada fechado, não inventa uma média de zero", () => {
    const r = resumoDoPeriodo([o({ codigo: "A" })], DE, ATE, AGORA);
    expect(r.horasAteFechar).toBeNull();
    expect(r.horasAteComecar).toBeNull();
  });
});

describe("onde é que o trabalho se concentrou", () => {
  const lista = [
    o({ codigo: "A", cliente_id: "c1" }),
    o({ codigo: "B", cliente_id: "c1", estado: "confirmada" }),
    o({ codigo: "C", cliente_id: "c2" }),
    o({ codigo: "D", cliente_id: "c1" }),
  ];

  it("põe o mais carregado em cima", () => {
    const t = topoPor(lista, (x) => x.cliente_id);
    expect(t[0]).toEqual({ chave: "c1", quantas: 3, porFechar: 2 });
  });

  it("corta no número que se pedir", () => {
    expect(topoPor(lista, (x) => x.cliente_id, 1)).toHaveLength(1);
  });

  // Uma barra grande chamada "—" rouba a atenção e não diz nada.
  it("ignora as que não têm chave, em vez de as juntar num grupo vazio", () => {
    const t = topoPor([...lista, o({ codigo: "E", local_id: null })], (x) => x.local_id);
    expect(t.every((x) => x.chave !== "")).toBe(true);
  });

  it("e não salta de ordem entre visitas", () => {
    const empatados = [o({ codigo: "A", cliente_id: "z" }), o({ codigo: "B", cliente_id: "a" })];
    expect(topoPor(empatados, (x) => x.cliente_id).map((x) => x.chave)).toEqual(["a", "z"]);
    expect(
      topoPor([...empatados].reverse(), (x) => x.cliente_id).map((x) => x.chave)
    ).toEqual(["a", "z"]);
  });
});

describe("os tempos, ditos como uma pessoa os diria", () => {
  it("minutos, horas e dias", () => {
    expect(emLinguagem(0.5)).toBe("30 min");
    expect(emLinguagem(3)).toBe("3 h");
    expect(emLinguagem(72)).toBe("3.0 dias");
    expect(emLinguagem(480)).toBe("20 dias");
  });

  it("e nada é um travessão, nunca um zero", () => {
    expect(emLinguagem(null)).toBe("—");
  });
});
