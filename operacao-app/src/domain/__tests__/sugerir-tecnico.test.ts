import { describe, expect, it } from "vitest";
import {
  comoHoras,
  comoKm,
  diasAOlhar,
  horasDaOrdem,
  listar,
  pontosDosLocais,
  sugerirTecnicos,
  type Candidato,
  type OrdemMarcada,
  type Pergunta,
} from "../sugerir-tecnico";

/**
 * O que aqui se prova, por esta ordem de importância:
 *
 *  1. que quem sabe fazer o trabalho ganha a quem não sabe, mesmo estando mais
 *     longe — que é a decisão de desenho mais forte deste ficheiro;
 *  2. que uma pergunta sem resposta (sem especialidade pedida, sem ponto no
 *     mapa) **não vota**, em vez de contar como zero;
 *  3. que férias, feriados e choques de hora aparecem como bloqueio e não como
 *     proibição — quem decide é quem coordena;
 *  4. que a lista nunca salta de ordem entre duas chamadas iguais.
 */

/* Lisboa, Cascais e Évora — perto, a meio caminho, e longe. */
const LISBOA = { latitude: 38.7223, longitude: -9.1393 };
const CASCAIS = { latitude: 38.6979, longitude: -9.4215 };
const EVORA = { latitude: 38.5714, longitude: -7.9135 };

const ELETRICISTA = "sk-ele";
const AVAC = "sk-avac";

const NOMES = new Map([
  [ELETRICISTA, "Eletricista"],
  [AVAC, "AVAC"],
]);

const pessoa = (
  id: string,
  nome: string,
  especialidades: string[] = []
): Candidato => ({ utilizador_id: id, nome, funcao: "tecnico", especialidades });

const marcada = (p: Partial<OrdemMarcada> & { id: string }): OrdemMarcada => ({
  responsavel_id: null,
  agendada_para: null,
  janela_inicio: null,
  janela_fim: null,
  local_id: null,
  ...p,
});

/** 16 de setembro de 2026 é uma quarta-feira. */
const DIA = new Date(2026, 8, 16);
const as = (hora: number, dia = 16) => new Date(2026, 8, dia, hora, 0, 0).toISOString();

const pergunta = (p: Partial<Pergunta>): Pergunta => ({
  ordemId: "esta",
  candidatos: [],
  exigidas: [],
  nomes: NOMES,
  destino: LISBOA,
  marcadas: [],
  pontos: new Map(),
  impedimentos: [],
  compromissos: [],
  dias: diasAOlhar(DIA, 7),
  hora: new Date(2026, 8, 16, 10, 0, 0),
  ...p,
});

/* ───────────────────────── 1. Saber fazer manda ─────────────────────────── */

describe("quem sabe fazer o trabalho", () => {
  it("ganha a quem está mais perto mas não sabe", () => {
    const r = sugerirTecnicos(
      pergunta({
        candidatos: [pessoa("perto", "Perto"), pessoa("sabe", "Sabe", [ELETRICISTA])],
        exigidas: [ELETRICISTA],
        // O "Perto" já vai estar no mesmo sítio; o "Sabe" vai estar em Évora.
        marcadas: [
          marcada({ id: "a", responsavel_id: "perto", agendada_para: as(15), local_id: "L1" }),
          marcada({ id: "b", responsavel_id: "sabe", agendada_para: as(15), local_id: "L2" }),
        ],
        pontos: new Map([
          ["L1", LISBOA],
          ["L2", EVORA],
        ]),
      })
    );

    expect(r[0].nome).toBe("Sabe");
    expect(r[0].perfil).toEqual({ exigidas: 1, tem: 1, falta: [] });
  });

  it("e a quem só tem metade das especialidades pedidas", () => {
    const r = sugerirTecnicos(
      pergunta({
        candidatos: [
          pessoa("meia", "Meia", [ELETRICISTA]),
          pessoa("toda", "Toda", [ELETRICISTA, AVAC]),
        ],
        exigidas: [ELETRICISTA, AVAC],
      })
    );

    expect(r[0].nome).toBe("Toda");
    expect(r[1].perfil).toEqual({ exigidas: 2, tem: 1, falta: ["AVAC"] });
  });

  it("e quem não a tem fica a saber qual lhe falta, pelo nome", () => {
    const r = sugerirTecnicos(
      pergunta({
        candidatos: [pessoa("nada", "Nada")],
        exigidas: [ELETRICISTA],
      })
    );
    expect(r[0].porque.join(" ")).toContain("Eletricista");
  });

  it("uma especialidade repetida na ordem conta uma vez", () => {
    const r = sugerirTecnicos(
      pergunta({
        candidatos: [pessoa("a", "A", [ELETRICISTA])],
        // Três tarefas, todas de eletricista.
        exigidas: [ELETRICISTA, ELETRICISTA, ELETRICISTA],
      })
    );
    expect(r[0].perfil?.exigidas).toBe(1);
  });
});

/* ────────────────── 2. Quem não sabe responder, não vota ────────────────── */

describe("uma pergunta sem resposta não vota", () => {
  it("sem especialidade pedida, a lista decide-se pela agenda e pela distância", () => {
    const r = sugerirTecnicos(
      pergunta({
        candidatos: [pessoa("cheio", "Cheio"), pessoa("livre", "Livre")],
        exigidas: [],
        marcadas: [
          marcada({
            id: "a",
            responsavel_id: "cheio",
            agendada_para: as(8),
            janela_inicio: as(8),
            janela_fim: as(16),
          }),
        ],
      })
    );

    expect(r[0].nome).toBe("Livre");
    expect(r[0].perfil).toBeNull();
    // Sem especialidade nenhuma pedida, ninguém pode ter 0 por causa disso.
    expect(r[0].pontos).toBe(100);
  });

  it("sem ponto no mapa, a distância não conta — nem a favor nem contra", () => {
    const semDestino = sugerirTecnicos(
      pergunta({ candidatos: [pessoa("a", "A")], destino: null, exigidas: [] })
    );
    expect(semDestino[0].km).toBeNull();
    expect(semDestino[0].pontos).toBe(100);
  });

  it("e uma paragem num local sem coordenadas também não conta", () => {
    const r = sugerirTecnicos(
      pergunta({
        candidatos: [pessoa("a", "A")],
        marcadas: [
          marcada({ id: "x", responsavel_id: "a", agendada_para: as(15), local_id: "sem-ponto" }),
        ],
        pontos: new Map(),
      })
    );
    expect(r[0].km).toBeNull();
  });
});

/* ───────────────────────── 3. Bloqueios, não vetos ──────────────────────── */

describe("férias, feriados e choques", () => {
  it("põem a pessoa em último, mas nunca a tiram da lista", () => {
    const r = sugerirTecnicos(
      pergunta({
        candidatos: [pessoa("ferias", "Férias"), pessoa("cá", "Cá")],
        impedimentos: [
          { utilizador_id: "ferias", dia: "2026-09-16", tipo: "ausente", detalhe: "Férias" },
        ],
      })
    );

    expect(r).toHaveLength(2);
    expect(r[1].nome).toBe("Férias");
    expect(r[1].bloqueios[0].tipo).toBe("ausente");
  });

  it("um feriado é de toda a gente, mesmo vindo sem dono", () => {
    const r = sugerirTecnicos(
      pergunta({
        candidatos: [pessoa("a", "A")],
        impedimentos: [
          { utilizador_id: "", dia: "2026-09-16", tipo: "feriado", detalhe: "Feriado municipal" },
        ],
      })
    );
    expect(r[0].bloqueios.map((b) => b.tipo)).toContain("feriado");
    expect(r[0].bloqueios[0].texto).toContain("Feriado municipal");
  });

  it("já ter outra ordem à mesma hora é um choque", () => {
    const r = sugerirTecnicos(
      pergunta({
        candidatos: [pessoa("a", "A")],
        marcadas: [marcada({ id: "outra", responsavel_id: "a", agendada_para: as(10) })],
      })
    );
    expect(r[0].bloqueios.map((b) => b.tipo)).toContain("choque");
  });

  it("mas duas horas depois já não é", () => {
    const r = sugerirTecnicos(
      pergunta({
        candidatos: [pessoa("a", "A")],
        marcadas: [marcada({ id: "outra", responsavel_id: "a", agendada_para: as(13) })],
      })
    );
    expect(r[0].bloqueios).toHaveLength(0);
  });

  it("sem hora marcada não há choque de hora nenhum a inventar", () => {
    const r = sugerirTecnicos(
      pergunta({
        candidatos: [pessoa("a", "A")],
        hora: null,
        marcadas: [marcada({ id: "outra", responsavel_id: "a", agendada_para: as(10) })],
      })
    );
    expect(r[0].bloqueios.map((b) => b.tipo)).not.toContain("choque");
  });

  it("a própria ordem nunca choca consigo mesma", () => {
    const r = sugerirTecnicos(
      pergunta({
        candidatos: [pessoa("a", "A")],
        marcadas: [marcada({ id: "esta", responsavel_id: "a", agendada_para: as(10) })],
      })
    );
    expect(r[0].bloqueios).toHaveLength(0);
    expect(r[0].horasNoDia).toBe(0);
  });
});

/* ──────────────────────── 4. Quando é que pode ir ───────────────────────── */

describe("sem data marcada, a pergunta passa a ser «quando»", () => {
  it("quem tem o dia de hoje cheio é proposto para o primeiro dia em que cabe", () => {
    const r = sugerirTecnicos(
      pergunta({
        hora: null,
        candidatos: [pessoa("a", "A")],
        marcadas: [
          marcada({
            id: "x",
            responsavel_id: "a",
            agendada_para: as(8),
            janela_inicio: as(8),
            janela_fim: as(17),
          }),
        ],
      })
    );

    expect(r[0].primeiroDiaLivre?.getDate()).toBe(17);
    expect(r[0].porque.join(" ")).toMatch(/a partir de/i);
  });

  it("e quem está livre hoje é proposto para hoje", () => {
    const r = sugerirTecnicos(pergunta({ hora: null, candidatos: [pessoa("a", "A")] }));
    expect(r[0].primeiroDiaLivre?.getDate()).toBe(16);
  });

  it("estar de férias a semana toda não deixa dia livre nenhum", () => {
    const r = sugerirTecnicos(
      pergunta({
        hora: null,
        candidatos: [pessoa("a", "A")],
        impedimentos: diasAOlhar(DIA, 7).map((d) => ({
          utilizador_id: "a",
          dia: `2026-09-${String(d.getDate()).padStart(2, "0")}`,
          tipo: "ausente" as const,
          detalhe: "Férias",
        })),
      })
    );
    expect(r[0].primeiroDiaLivre).toBeNull();
  });
});

/* ────────────────────────── 5. A conta e a ordem ────────────────────────── */

describe("a conta", () => {
  it("dá sempre um número entre 0 e 100", () => {
    const r = sugerirTecnicos(
      pergunta({
        candidatos: [pessoa("a", "A", [ELETRICISTA]), pessoa("b", "B")],
        exigidas: [ELETRICISTA, AVAC],
        marcadas: [
          marcada({ id: "x", responsavel_id: "b", agendada_para: as(15), local_id: "L" }),
        ],
        pontos: new Map([["L", CASCAIS]]),
      })
    );
    for (const s of r) {
      expect(s.pontos).toBeGreaterThanOrEqual(0);
      expect(s.pontos).toBeLessThanOrEqual(100);
    }
  });

  it("e traz sempre pelo menos uma razão escrita", () => {
    const r = sugerirTecnicos(
      pergunta({ candidatos: [pessoa("a", "A")], exigidas: [ELETRICISTA] })
    );
    expect(r[0].porque.length).toBeGreaterThan(0);
  });

  it("uma lista igual dá sempre a mesma ordem — nunca salta", () => {
    const p = pergunta({
      candidatos: [pessoa("z", "Zulmira"), pessoa("a", "Ana"), pessoa("m", "Miguel")],
    });
    expect(sugerirTecnicos(p).map((x) => x.nome)).toEqual(["Ana", "Miguel", "Zulmira"]);
    expect(sugerirTecnicos(p).map((x) => x.nome)).toEqual(
      sugerirTecnicos(p).map((x) => x.nome)
    );
  });

  it("sem candidatos, devolve uma lista vazia e não rebenta", () => {
    expect(sugerirTecnicos(pergunta({ candidatos: [] }))).toEqual([]);
  });
});

/* ──────────────────────────── As peças pequenas ─────────────────────────── */

describe("as peças pequenas", () => {
  it("uma ordem sem janela conta uma hora", () => {
    expect(horasDaOrdem(marcada({ id: "x", agendada_para: as(9) }))).toBe(1);
  });

  it("com janela, conta a janela", () => {
    expect(
      horasDaOrdem(
        marcada({ id: "x", agendada_para: as(9), janela_inicio: as(9), janela_fim: as(12) })
      )
    ).toBe(3);
  });

  it("e uma janela ao contrário não dá horas negativas", () => {
    expect(
      horasDaOrdem(
        marcada({ id: "x", agendada_para: as(9), janela_inicio: as(12), janela_fim: as(9) })
      )
    ).toBe(1);
  });

  it("só entram no mapa os locais que são mesmo um sítio", () => {
    const m = pontosDosLocais([
      { id: "bom", latitude: 38.7, longitude: -9.1 },
      { id: "vazio", latitude: null, longitude: null },
      { id: "atlantico", latitude: 0, longitude: 0 },
      { id: "impossivel", latitude: 412, longitude: -9.1 },
    ]);
    expect([...m.keys()]).toEqual(["bom"]);
  });

  it("os dias olham para a frente, e incluem o próprio", () => {
    const d = diasAOlhar(DIA, 3);
    expect(d.map((x) => x.getDate())).toEqual([16, 17, 18]);
  });

  it("as horas e os quilómetros dizem-se como se dizem em voz alta", () => {
    expect(comoHoras(6)).toBe("6 h");
    expect(comoHoras(1.5)).toBe("1 h 30");
    expect(comoHoras(0.5)).toBe("30 min");
    expect(comoKm(0.4)).toBe("400 m");
    expect(comoKm(12.34)).toBe("12,3 km");
  });

  it("as listas de nomes lêem-se com «e» no fim", () => {
    expect(listar(["A"])).toBe("A");
    expect(listar(["A", "B"])).toBe("A e B");
    expect(listar(["A", "B", "C"])).toBe("A, B e C");
  });
});
